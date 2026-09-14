from typing import Any, Dict, List, Tuple


def reconstruct_markdown(
    extracted_lines: List[Dict[str, Any]],
    table_only: bool = False,
) -> Tuple[str, List[str]]:
    """Reconstruct OCR lines into full Markdown and isolated GFM tables.

    ``markdown`` keeps all detected text for the full OCR contract. The
    ``tables`` result is built only from rows that form a multi-column block.
    When ``table_only`` is enabled, no-table input returns an empty string
    instead of silently falling back to the full OCR output.
    """
    if not extracted_lines:
        return "", []

    items: List[Dict[str, Any]] = []
    for line in extracted_lines:
        box = line.get("box")
        text = (line.get("text") or "").strip()
        if not text:
            continue

        if box and len(box) >= 4:
            xs = [point[0] for point in box]
            ys = [point[1] for point in box]
            items.append({
                "text": text,
                "x_min": min(xs),
                "x_max": max(xs),
                "y_min": min(ys),
                "y_max": max(ys),
                "x_center": (min(xs) + max(xs)) / 2.0,
                "y_center": (min(ys) + max(ys)) / 2.0,
                "height": max(ys) - min(ys),
                "width": max(xs) - min(xs),
            })
        else:
            items.append({
                "text": text,
                "x_min": 0,
                "x_max": 100,
                "y_min": 0,
                "y_max": 20,
                "x_center": 50,
                "y_center": 10,
                "height": 20,
                "width": 100,
            })

    if not items:
        return "", []

    # Keep spatially separate regions independent so page chrome cannot
    # influence the gutter calculation for a table.
    adjacency: Dict[int, List[int]] = {index: [] for index in range(len(items))}
    for index, item in enumerate(items):
        for other_index in range(index + 1, len(items)):
            other = items[other_index]
            horizontal_gap = max(
                0.0,
                max(item["x_min"], other["x_min"])
                - min(item["x_max"], other["x_max"]),
            )
            vertical_gap = max(
                0.0,
                max(item["y_min"], other["y_min"])
                - min(item["y_max"], other["y_max"]),
            )
            if horizontal_gap <= 160 and vertical_gap <= 80:
                adjacency[index].append(other_index)
                adjacency[other_index].append(index)

    components: List[List[Dict[str, Any]]] = []
    visited = set()
    for index in range(len(items)):
        if index in visited:
            continue
        component: List[Dict[str, Any]] = []
        queue = [index]
        visited.add(index)
        while queue:
            current = queue.pop(0)
            component.append(items[current])
            for neighbor in adjacency[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        components.append(component)

    components.sort(key=lambda component: (
        min(item["y_min"] for item in component),
        min(item["x_min"] for item in component),
    ))

    markdown_blocks: List[str] = []
    extracted_tables: List[str] = []

    for component in components:
        rows: List[List[Dict[str, Any]]] = []
        for item in sorted(component, key=lambda value: (value["y_min"], value["x_min"])):
            placed = False
            for row in rows:
                row_y_min = min(value["y_min"] for value in row)
                row_y_max = max(value["y_max"] for value in row)
                row_height = max(1.0, row_y_max - row_y_min)
                overlap = max(
                    0.0,
                    min(row_y_max, item["y_max"])
                    - max(row_y_min, item["y_min"]),
                )
                if overlap > 0.3 * min(row_height, item["height"]):
                    row.append(item)
                    placed = True
                    break
            if not placed:
                rows.append([item])

        rows.sort(key=lambda row: min(item["y_min"] for item in row))

        def is_multi_column(row: List[Dict[str, Any]]) -> bool:
            if len(row) < 2:
                return False
            ordered = sorted(row, key=lambda item: item["x_min"])
            return any(
                right["x_min"] - left["x_max"] > 12
                for left, right in zip(ordered, ordered[1:])
            )

        multi_column_indices = [
            index for index, row in enumerate(rows) if is_multi_column(row)
        ]

        if len(multi_column_indices) < 2:
            for row in rows:
                text = " ".join(
                    item["text"] for item in sorted(row, key=lambda value: value["x_min"])
                )
                if text:
                    markdown_blocks.append(text)
            continue

        first_table_row = multi_column_indices[0]
        last_table_row = multi_column_indices[-1] + 1
        lead_rows = rows[:first_table_row]
        table_rows = rows[first_table_row:last_table_row]
        trail_rows = rows[last_table_row:]

        for row in lead_rows:
            text = " ".join(
                item["text"] for item in sorted(row, key=lambda value: value["x_min"])
            )
            if text:
                markdown_blocks.append(text)

        table_items = [item for row in table_rows for item in row]
        min_x = min(item["x_min"] for item in table_items)
        max_x = max(item["x_max"] for item in table_items)
        occupancy = [0] * (int(max_x) + 2)
        for item in table_items:
            for x in range(int(item["x_min"]), int(item["x_max"]) + 1):
                occupancy[x] += 1

        gutters: List[float] = []
        in_gap = False
        gap_start = 0
        for x in range(int(min_x), int(max_x) + 1):
            if occupancy[x] == 0:
                if not in_gap:
                    in_gap = True
                    gap_start = x
            elif in_gap:
                in_gap = False
                if x - gap_start >= 8:
                    gutters.append((gap_start + x) / 2.0)

        if gutters:
            cutoffs = [-1e9] + gutters + [1e9]
            column_count = len(cutoffs) - 1
            grid: List[List[str]] = []
            for row in table_rows:
                cells: List[List[Dict[str, Any]]] = [
                    [] for _ in range(column_count)
                ]
                for item in row:
                    for column in range(column_count):
                        if cutoffs[column] <= item["x_center"] < cutoffs[column + 1]:
                            cells[column].append(item)
                            break
                grid.append([
                    " ".join(
                        value["text"].replace("|", "\\|")
                        for value in sorted(cell, key=lambda value: (value["y_min"], value["x_min"]))
                    )
                    for cell in cells
                ])

            header = grid[0]
            separator = [":---" for _ in header]
            table_lines = [
                "| " + " | ".join(header) + " |",
                "| " + " | ".join(separator) + " |",
            ]
            table_lines.extend("| " + " | ".join(row) + " |" for row in grid[1:])
            table = "\n".join(table_lines)
            extracted_tables.append(table)
            markdown_blocks.append(table)
        else:
            for row in table_rows:
                markdown_blocks.append(
                    " ".join(item["text"] for item in sorted(row, key=lambda value: value["x_min"]))
                )

        for row in trail_rows:
            text = " ".join(
                item["text"] for item in sorted(row, key=lambda value: value["x_min"])
            )
            if text:
                markdown_blocks.append(text)

    full_markdown = "\n\n".join(markdown_blocks)
    if table_only:
        return "\n\n".join(extracted_tables), extracted_tables
    return full_markdown, extracted_tables
