#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import random
from datetime import date, timedelta

SCHEMA = [
    "id",
    "first_name",
    "last_name",
    "email",
    "country",
    "signup_date",
    "amount",
    "status",
]

FIRST_NAMES = [
    "John",
    "Jane",
    "Bob",
    "Alice",
    "Charlie",
    "David",
    "Emma",
    "Frank",
    "Grace",
    "Henry",
    "Isabel",
    "Jack",
    "Kate",
    "Liam",
    "Mia",
    "Noah",
    "Olivia",
    "Paul",
]

LAST_NAMES = [
    "Doe",
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Miller",
    "Davis",
    "Wilson",
    "Moore",
    "Taylor",
    "Anderson",
    "Thomas",
    "Jackson",
    "White",
    "Harris",
    "Martin",
    "Thompson",
    "Garcia",
]

COUNTRIES = [
    "USA",
    "united states",
    "usa",
    "UK",
    "United Kingdom",
    "uk",
    "Canada",
    "canada",
    "Australia",
    "australia",
    "New Zealand",
    "new zealand",
]

STATUSES = ["active", "Active", "ACTIVE", "inactive", "Inactive", "INACTIVE"]


def messy_case(rng: random.Random, value: str) -> str:
    option = rng.choice(["upper", "lower", "title", "pad-left", "pad-right", "clean"])
    if option == "upper":
      return value.upper()
    if option == "lower":
      return value.lower()
    if option == "title":
      return value.title()
    if option == "pad-left":
      return f"  {value}"
    if option == "pad-right":
      return f"{value}  "
    return value


def messy_email(rng: random.Random, first_name: str, last_name: str) -> str:
    base = f"{first_name}.{last_name}".replace(" ", "").lower()
    option = rng.choice(["clean", "upper", "missing-domain", "missing-tld", "spaced"])
    if option == "clean":
        return f"{base}@email.com"
    if option == "upper":
        return f"{base}@email.com".upper()
    if option == "missing-domain":
        return f"{base}@"
    if option == "missing-tld":
        return f"{base}@email"
    return f" {base}@email.com "


def messy_date(rng: random.Random, start: date, offset: int) -> str:
    value = start + timedelta(days=offset)
    if rng.random() < 0.45:
        return value.strftime("%Y-%m-%d")
    return value.strftime("%m/%d/%Y")


def messy_amount(rng: random.Random) -> str | None:
    if rng.random() < 0.12:
        return None
    value = round(rng.uniform(350, 5200), 2)
    option = rng.choice(["plain", "currency", "comma", "integerish"])
    if option == "plain":
        return f"{value:.2f}"
    if option == "currency":
        return f"${value:,.2f}"
    if option == "comma":
        return f"{value:,.2f}"
    return str(int(value))


def maybe_null(rng: random.Random, value: str) -> str | None:
    return None if rng.random() < 0.08 else value


def generate_rows(seed: int, row_count: int) -> list[dict[str, object]]:
    rng = random.Random(seed)
    start = date(2024, 1, 15)
    rows: list[dict[str, object]] = []

    for index in range(row_count):
        first_name = rng.choice(FIRST_NAMES)
        last_name = rng.choice(LAST_NAMES)

        row = {
            "id": index + 1,
            "first_name": maybe_null(rng, messy_case(rng, first_name)),
            "last_name": maybe_null(rng, messy_case(rng, last_name)),
            "email": messy_email(rng, first_name, last_name),
            "country": maybe_null(rng, rng.choice(COUNTRIES)),
            "signup_date": messy_date(rng, start, index),
            "amount": messy_amount(rng),
            "status": rng.choice(STATUSES),
        }
        rows.append(row)

    duplicate_count = max(2, row_count // 8)
    for _ in range(duplicate_count):
        duplicate_source = dict(rng.choice(rows))
        duplicate_source["id"] = len(rows) + 1
        rows.append(duplicate_source)

    return rows


def build_payload(seed: int, row_count: int) -> dict[str, object]:
    rows = generate_rows(seed, row_count)
    return {
        "race_id": f"race-{seed}",
        "seed": seed,
        "schema_version": "v1",
        "table_name": "raw_table",
        "columns": SCHEMA,
        "row_count": len(rows),
        "rows": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a seeded Data Grand Prix race dataset.")
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--rows", type=int, default=18)
    parser.add_argument("--output", type=str, required=True)
    args = parser.parse_args()

    payload = build_payload(args.seed, args.rows)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
