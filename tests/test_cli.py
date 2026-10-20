"""Smoke tests for the Opuscule CLI."""

from __future__ import annotations

import io
import unittest
from contextlib import redirect_stdout

from opuscule.cli import main, print_hi


class CliTests(unittest.TestCase):
    def test_print_hi(self) -> None:
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            print_hi("Opuscule")
        self.assertEqual(buffer.getvalue().strip(), "Hi, Opuscule")

    def test_main_default(self) -> None:
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            code = main([])
        self.assertEqual(code, 0)
        self.assertIn("Hi, Opuscule", buffer.getvalue())


if __name__ == "__main__":
    unittest.main()
