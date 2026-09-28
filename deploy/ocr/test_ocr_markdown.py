import unittest

from ocr_markdown import reconstruct_markdown


def box(x_min: int, y_min: int, x_max: int, y_max: int):
    return [[x_min, y_min], [x_max, y_min], [x_max, y_max], [x_min, y_max]]


class ReconstructMarkdownTests(unittest.TestCase):
    def test_table_markdown_excludes_surrounding_ocr_text(self):
        lines = [
            {"text": "圖片網址", "box": box(100, 20, 240, 40)},
            {"text": "國衛院", "box": box(100, 120, 180, 140)},
            {"text": "時間", "box": box(360, 120, 420, 140)},
            {"text": "國健署", "box": box(620, 120, 700, 140)},
            {"text": "2013~2016", "box": box(100, 160, 220, 180)},
            {"text": "時間", "box": box(360, 160, 420, 180)},
            {"text": "2016.09~12", "box": box(620, 160, 760, 180)},
            {"text": "尚未發布", "box": box(100, 240, 240, 260)},
        ]

        full_markdown, tables = reconstruct_markdown(lines)
        table_markdown, _ = reconstruct_markdown(lines, table_only=True)

        self.assertIn("圖片網址", full_markdown)
        self.assertIn("尚未發布", full_markdown)
        self.assertEqual(len(tables), 1)
        self.assertEqual(table_markdown, tables[0])
        self.assertNotIn("圖片網址", table_markdown)
        self.assertNotIn("尚未發布", table_markdown)

    def test_table_only_returns_empty_when_no_table_is_detected(self):
        lines = [
            {"text": "圖片網址", "box": box(100, 20, 240, 40)},
            {"text": "尚未發布", "box": box(100, 80, 240, 100)},
        ]

        table_markdown, tables = reconstruct_markdown(lines, table_only=True)

        self.assertEqual(table_markdown, "")
        self.assertEqual(tables, [])

    def test_vertical_layout_reading_order_and_line_unwrapping(self):
        # 6 vertical boxes across 3 vertical columns (Right to Left: Col 1 -> Col 2 -> Col 3)
        lines = [
            # Right column (x: 500..530)
            {"text": "一、國字注音", "box": box(500, 50, 530, 200)},
            {"text": "1. 太陽對我微笑", "box": box(500, 210, 530, 350)},
            # Middle column (x: 350..380)
            {"text": "2. 做事要持之以恆", "box": box(350, 50, 380, 250)},
            {"text": "才會成功", "box": box(350, 260, 380, 380)},
            # Left column (x: 200..230)
            {"text": "二、改錯字", "box": box(200, 50, 230, 200)},
            {"text": "1. 下課聊天", "box": box(200, 210, 230, 350)},
        ]

        full_markdown, tables = reconstruct_markdown(lines)
        table_markdown, _ = reconstruct_markdown(lines, table_only=True)

        # Right-to-Left order: Col 1 (國字注音) before Col 3 (改錯字)
        pos1 = full_markdown.index("一、國字注音")
        pos2 = full_markdown.index("二、改錯字")
        self.assertLess(pos1, pos2)

        # Unwrapping: "才會成功" continues question 2
        self.assertIn("2. 做事要持之以恆才會成功", full_markdown)

        # Vertical text does not produce fake GFM tables
        self.assertEqual(len(tables), 0)
        self.assertEqual(table_markdown, "")

    def test_vertical_tall_outer_edge_columns_remain_in_flow(self):
        # A tall body column at the leftmost margin (spanning > 60% page height)
        # must stay at the END of reading order in right-to-left flow, not plucked to top.
        lines = [
            # Right column (x: 500..530)
            {"text": "第一段文章起頭", "box": box(500, 50, 530, 450)},
            # Middle column (x: 350..380)
            {"text": "第二段文章內容", "box": box(350, 50, 380, 450)},
            # Left edge tall column (x: 50..80, height: 400 out of 450)
            {"text": "結尾落款於左側邊緣", "box": box(50, 50, 80, 450)},
            # Vertical boxes to trigger vertical mode detection
            {"text": "注釋一", "box": box(450, 50, 470, 200)},
            {"text": "注釋二", "box": box(400, 50, 420, 200)},
        ]

        full_markdown, _ = reconstruct_markdown(lines)
        pos_start = full_markdown.index("第一段文章起頭")
        pos_mid = full_markdown.index("第二段文章內容")
        pos_end = full_markdown.index("結尾落款於左側邊緣")

        # Must follow natural Right-to-Left order: right -> mid -> left edge
        self.assertLess(pos_start, pos_mid)
        self.assertLess(pos_mid, pos_end)
        self.assertFalse(full_markdown.startswith("# 結尾落款於左側邊緣"))

    def test_vertical_nonzero_y_origin_lane_detection(self):
        # Test coordinates where min_y is far from 0 (e.g. y starts at 500)
        # Upper tier: y = 500..800
        # Lower tier: y = 860..1160
        # Dividing gap: y = 800..860
        lines = [
            # Upper tier (y: 500..800)
            {"text": "一、上半部題目", "box": box(500, 500, 530, 650)},
            {"text": "上半部第1題", "box": box(500, 660, 530, 800)},
            {"text": "上半部第2題", "box": box(350, 500, 380, 650)},
            # Lower tier (y: 860..1160)
            {"text": "二、下半部題目", "box": box(500, 860, 530, 1010)},
            {"text": "下半部第1題", "box": box(500, 1020, 530, 1160)},
            {"text": "下半部第2題", "box": box(350, 860, 380, 1010)},
        ]

        full_markdown, _ = reconstruct_markdown(lines)
        pos_upper = full_markdown.index("一、上半部題目")
        pos_lower = full_markdown.index("二、下半部題目")

        # Upper tier must precede Lower tier
        self.assertLess(pos_upper, pos_lower)


if __name__ == "__main__":
    unittest.main()

