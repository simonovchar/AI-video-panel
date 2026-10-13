"""Собирает roadmap.js из .docx файла roadmap.

Запуск:  python3 tools/build_roadmap.py "../AI_video_roadmap_RU_v3.docx"
"""
import html
import json
import re
import sys
import zipfile
from pathlib import Path

SECTION_KEYS = {
    "Темы": "topics",
    "Инструменты": "tools",
    "Задания": "tasks",
    "Задание": "tasks",
    "Полный цикл проекта": "cycle",
}
PERIODIC_KEYS = {"Каждый день": "daily", "Каждую неделю": "weekly", "Каждый месяц": "monthly"}


def paragraphs(docx_path):
    xml = zipfile.ZipFile(docx_path).read("word/document.xml").decode("utf-8")
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, flags=re.S):
        style = re.search(r'<w:pStyle w:val="([^"]+)"', p)
        text = html.unescape("".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", p))).strip()
        if text:
            yield (style.group(1) if style else "Normal"), text


def build(docx_path):
    data = {"title": "", "subtitle": "", "blocks": [], "stages": [], "periodic": [], "skills": [], "regimen": [], "goal": [], "intro": []}
    h1 = None
    stage = None
    section = None

    for style, text in paragraphs(docx_path):
        is_item = style.startswith("List")
        if style == "Title":
            data["title"] = text
        elif style == "Heading1":
            h1, section, stage = text, None, None
            m = re.match(r"(Доп\. )?[Ээ]тап (\d+)\. (.+)", text)
            if m:
                extra = bool(m.group(1))
                num = int(m.group(2))
                title = m.group(3)
                is_tool = title.startswith("Инструменты:")
                if is_tool:
                    title = title.removeprefix("Инструменты:").strip()
                    title = title[0].upper() + title[1:]
                stage = {
                    "id": f"{'x' if extra else 's'}{num:02d}",
                    "num": num,
                    "extra": extra,
                    "title": title,
                    "isTool": is_tool,
                    "term": "",
                    "notes": [],
                    "sections": [],
                }
                data["stages"].append(stage)
        elif style == "Heading2":
            if stage:
                key = SECTION_KEYS.get(text, "other")
                section = {"id": f"{stage['id']}-{key}", "key": key, "title": text, "items": []}
                stage["sections"].append(section)
            elif h1 and h1.startswith("Постоянные задания"):
                key = PERIODIC_KEYS.get(text, text)
                section = {"id": f"p-{key}", "key": key, "title": text, "items": []}
                data["periodic"].append(section)
        elif is_item:
            if stage and section:
                section["items"].append({"id": f"{section['id']}-{len(section['items']) + 1:02d}", "text": text})
            elif h1 and h1.startswith("Постоянные задания") and section:
                section["items"].append({"id": f"{section['id']}-{len(section['items']) + 1:02d}", "text": text})
            elif h1 == "Структура программы":
                m = re.match(r"Блок (\d+)\. (.+?) — этап\S* (\d+)(?:–(\d+))? \((.+?)\)", text)
                if m:
                    first = int(m.group(3))
                    data["blocks"].append({
                        "num": int(m.group(1)),
                        "title": m.group(2),
                        "from": first,
                        "to": int(m.group(4) or first),
                        "weeks": m.group(5),
                        "extra": False,
                    })
                m = re.match(r"Дополнительный блок\. (.+?) — доп\. этапы (\d+)–(\d+) \((.+?)\)", text)
                if m:
                    data["blocks"].append({
                        "num": 0,
                        "title": m.group(1),
                        "from": int(m.group(2)),
                        "to": int(m.group(3)),
                        "weeks": m.group(4),
                        "extra": True,
                    })
            elif h1 == "Итоговые навыки":
                data["skills"].append(text)
            elif h1 == "Рекомендуемый режим обучения":
                data["regimen"].append(text)
        else:
            if stage:
                if text.startswith("Срок:"):
                    stage["term"] = text.removeprefix("Срок:").strip()
                else:
                    stage["notes"].append(text)
            elif h1 is None:
                data["subtitle"] = text
            elif h1 == "Структура программы":
                data["intro"].append(text)
            elif h1 == "Финальная цель":
                data["goal"].append(text)
    return data


if __name__ == "__main__":
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "../AI_video_roadmap_RU_v3.docx")
    out = Path(__file__).resolve().parent.parent / "roadmap.js"
    data = build(src)
    out.write_text("// Сгенерировано tools/build_roadmap.py — не редактировать вручную.\nwindow.ROADMAP = "
                   + json.dumps(data, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    total = sum(len(s["items"]) for st in data["stages"] for s in st["sections"])
    print(f"Этапов: {len(data['stages'])}, блоков: {len(data['blocks'])}, пунктов: {total} → {out}")
