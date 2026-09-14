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


if __name__ == "__main__":
    unittest.main()
