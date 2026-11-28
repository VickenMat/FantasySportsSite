import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = (
    Path(__file__).resolve().parents[2] / "scripts" / "tooling" / "elapsed_duration.py"
)
SPEC = importlib.util.spec_from_file_location("elapsed_duration", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
elapsed_duration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(elapsed_duration)


class FormatElapsedTests(unittest.TestCase):
    def test_unit_boundaries_and_fractional_seconds(self):
        cases = (
            (0, "0:00"),
            (0.99, "0:00"),
            (59.99, "0:59"),
            (60, "1:00"),
            (3599.99, "59:59"),
            (3600, "1:00:00"),
            (3661.99, "1:01:01"),
            (25 * 3600, "25:00:00"),
        )
        for seconds, expected in cases:
            with self.subTest(seconds=seconds):
                self.assertEqual(elapsed_duration.format_elapsed(seconds), expected)

    def test_large_integer_preserves_precision(self):
        hours = 10**20
        self.assertEqual(
            elapsed_duration.format_elapsed(hours * 3600 + 61), f"{hours}:01:01"
        )

    def test_integer_beyond_decimal_conversion_limit(self):
        seconds = 10**5000
        self.assertEqual(
            elapsed_duration.format_elapsed(seconds), "2" + "7" * 4996 + ":46:40"
        )

    def test_invalid_inputs_raise_value_error(self):
        for seconds in (
            True,
            False,
            -1,
            -0.01,
            float("nan"),
            float("inf"),
            float("-inf"),
            "60",
            None,
            1 + 0j,
        ):
            with self.subTest(seconds=seconds):
                with self.assertRaises(ValueError):
                    elapsed_duration.format_elapsed(seconds)


if __name__ == "__main__":
    unittest.main()
