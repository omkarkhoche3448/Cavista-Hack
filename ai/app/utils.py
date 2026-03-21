import csv
from pathlib import Path


def search_icd_code(diagnosis: str, max_results: int = 5) -> list[dict]:
    """
    Search diagnosis.csv for ICD codes matching the given diagnosis string.
    Returns a list of dicts with 'code', 'short_description', and 'long_description'.
    """
    csv_path = Path(__file__).resolve().parent.parent / "diagnosis.csv"
    if not csv_path.exists():
        return []

    diagnosis_lower = diagnosis.lower().strip()
    results = []

    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            short = row.get("ShortDescription", "").lower()
            long = row.get("LongDescription", "").lower()
            # Check if the search term appears in either description
            if diagnosis_lower in short or diagnosis_lower in long:
                results.append({
                    "code": row.get("CodeWithSeparator", ""),
                    "short_description": row.get("ShortDescription", ""),
                    "long_description": row.get("LongDescription", ""),
                })
                if len(results) >= max_results:
                    break

    return results


