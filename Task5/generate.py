import os
import json
import random
from pathlib import Path

# --- НАСТРОЙКИ ---
COUNT = 10  # сколько файлов создать (поставь 1000, если нужно)
BASE_IMAGE_URI = "ipfs://QmYourImageHashHere/"

first_names = ["Alex", "Maria", "John", "Elena", "Dmitry", "Kate", "Ivan", "Olga"]
programs = ["Blockchain Dev", "Frontend React", "Fullstack Python", "Cybersecurity"]
grades = ["A", "A+", "B", "B+"]

def rnd(arr):
    return random.choice(arr)

def generate_metadata(count=COUNT, outdir="output"):
    out_path = Path(__file__).resolve().parent / outdir
    out_path.mkdir(parents=True, exist_ok=True)
    print(f"Начинаю генерацию {count} файлов в {out_path}")

    for i in range(count):
        student_name = f"{rnd(first_names)} {i+1}"
        program = rnd(programs)
        grade = rnd(grades)

        metadata = {
            "name": f"Certificate #{i}",
            "description": f"Official Graduation Certificate for {student_name}",
            "image": f"{BASE_IMAGE_URI}{i}.png",
            "attributes": [
                {"trait_type": "Student Name", "value": student_name},
                {"trait_type": "Program", "value": program},
                {"trait_type": "Grade", "value": grade},
                {"trait_type": "Batch", "value": "2024"}
            ]
        }

        filename = out_path / f"{i}.json"
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)

    print("Готово! Файлы в папке:", out_path)

if __name__ == "__main__":
    # Можно менять COUNT через аргументы, если нужно
    generate_metadata()