"""Safely decode Python-literal localized names; never evaluate source code."""
import ast
import csv
import hashlib
import json
import sys

source, destination = sys.argv[1:]
rows = failed = 0
with open(source, encoding="utf-8-sig", newline="") as stream, open(destination, "w", encoding="utf-8") as output:
    for number, row in enumerate(csv.DictReader(stream), start=2):
        rows += 1
        raw = row.get("name", "")
        try:
            parsed = ast.literal_eval(raw)
            if not isinstance(parsed, dict) or any(not isinstance(k, str) or (v is not None and not isinstance(v, str)) for k, v in parsed.items()):
                raise ValueError("Unexpected localized name structure")
            value = {k: v for k, v in parsed.items() if v is not None and v != ""}
        except (ValueError, SyntaxError, TypeError, RecursionError):
            failed += 1
            value = {"unparsedSourceRecord": number}
        output.write(json.dumps({"sourceRecord": number, "rawNameSha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(), "value": value}, ensure_ascii=False) + "\n")
print(json.dumps({"rows": rows, "failed": failed, "parser": "Python ast.literal_eval; no executable evaluation", "nullLocaleExpansionIgnored": True}))
