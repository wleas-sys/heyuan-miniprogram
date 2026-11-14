# 生成「无图景区补图清单」xlsx：单表、可筛选、带补图状态列
import json
import os

try:
    import openpyxl
except ImportError:
    import subprocess, sys
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "openpyxl>=3.1.0"])
    import openpyxl

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation


def xl_color(css_hex: str) -> str:
    value = css_hex.removeprefix("#").upper()
    if len(value) != 6:
        raise ValueError(f"Expected #RRGGBB, got: {css_hex}")
    return "FF" + value


XL_HEADER = xl_color("#70AD47")
XL_HEADER_TEXT = xl_color("#FFFFFF")
XL_BORDER = xl_color("#D9D9D9")
XL_ZEBRA = xl_color("#F4F9F0")

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(BASE, "places.json"), encoding="utf-8"))
OUT = os.path.abspath(os.path.join(BASE, "..", "无图景区补图清单.xlsx"))

HEADERS = ["序号", "景区名称", "区县", "类别", "建议游览时长", "地址", "有坐标", "门票参考", "补图状态", "备注"]
WIDTHS = [6, 26, 10, 8, 34, 40, 8, 44, 10, 24]
WRAP_COLS = {"E", "F", "H", "J"}

wb = Workbook()
ws = wb.active
ws.title = "无图景区"
wb.properties.title = "无图景区补图清单"

thin = Side(style="thin", color=XL_BORDER)
border = Border(left=thin, right=thin, top=thin, bottom=thin)

# 表头（第 1 行）
for idx, (name, width) in enumerate(zip(HEADERS, WIDTHS), start=1):
    cell = ws.cell(row=1, column=idx, value=name)
    cell.font = Font(bold=True, color=XL_HEADER_TEXT, size=11)
    cell.fill = PatternFill("solid", fgColor=XL_HEADER)
    cell.alignment = Alignment(horizontal="center", vertical="center")
    cell.border = border
    ws.column_dimensions[cell.column_letter].width = width
ws.row_dimensions[1].height = 26

# 数据区（第 2~56 行）
for i, p in enumerate(DATA, start=1):
    r = i + 1
    values = [i, p["name"], p["region"], p["category"], p["duration"], p["address"], p["hasMap"], p["ticket"], "待补图", ""]
    for c, value in enumerate(values, start=1):
        cell = ws.cell(row=r, column=c, value=value)
        cell.border = border
        letter = cell.column_letter
        wrap = letter in WRAP_COLS
        cell.alignment = Alignment(
            horizontal="center" if letter in {"A", "C", "D", "G", "I"} else "left",
            vertical="top" if wrap else "center",
            wrap_text=wrap,
        )
        if i % 2 == 0:
            cell.fill = PatternFill("solid", fgColor=XL_ZEBRA)

# 下拉：补图状态
dv = DataValidation(type="list", formula1='"待补图,已补图,暂无合适图"', allow_blank=True)
dv.error = "请选择：待补图 / 已补图 / 暂无合适图"
dv.errorTitle = "补图状态"
ws.add_data_validation(dv)
dv.add(f"I2:I{len(DATA) + 1}")

ws.freeze_panes = "A2"
ws.auto_filter.ref = f"A1:J{len(DATA) + 1}"
ws.sheet_view.zoomScale = 100

wb.save(OUT)
print(OUT)
