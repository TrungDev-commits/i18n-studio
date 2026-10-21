#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Tool phân tích và dọn dẹp i18n messages (VI & EN)
Dự án: Hệ thống Thủy Lợi TP.HCM

Chức năng:
1. --audit          : Quét tổng quan số lượng key, key trùng lặp, key thiếu giữa 2 ngôn ngữ.
2. --clean-dup-keys : Tự động xóa các key bị khai báo trùng lặp (Duplicate Key definitions) trong cùng một file.
3. --find-dup-values: Gom nhóm các key khác nhau nhưng có nội dung (value) giống hệt nhau.
4. --find-unused    : Quét trong source code (src/, resources/, app/) để tìm các key không còn được sử dụng.
5. --report <file>  : Xuất báo cáo chi tiết ra file Markdown (mặc định: reports/messages_audit.md).

Cách dùng:
  python scripts/clean_and_audit_messages.py --audit
  python scripts/clean_and_audit_messages.py --clean-dup-keys
  python scripts/clean_and_audit_messages.py --find-dup-values
  python scripts/clean_and_audit_messages.py --find-unused
"""

import os
import sys
import re
import argparse
from collections import defaultdict

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
VI_PATH = os.path.join(ROOT_DIR, 'resources', 'lang', 'vi', 'messages.php')
EN_PATH = os.path.join(ROOT_DIR, 'resources', 'lang', 'en', 'messages.php')


def extract_raw_entries(file_path):
    """
    Đọc file PHP array và trích xuất từng entry:
    Trả về:
      entries: list of dict {
          'index': số thứ tự,
          'line_no': số dòng,
          'raw_key': key nguyên bản,
          'raw_val': value nguyên bản (đã unquote cơ bản),
          'raw_line': toàn bộ dòng đó
      }
      header_lines: các dòng mở đầu (trước return [)
      footer_lines: các dòng kết thúc (];)
    """
    if not os.path.exists(file_path):
        print(f"[!] File không tồn tại: {file_path}")
        return [], [], []

    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    entries = []
    header_lines = []
    footer_lines = []
    in_array = False

    # Regex bắt key => value
    # Hỗ trợ: 'key' => 'val', hoặc "key" => "val",
    key_val_pattern = re.compile(r'''^\s*['"]([^'"]+)['"]\s*=>\s*(.*)$''')

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        if not in_array:
            header_lines.append(line)
            if 'return [' in line or 'return array(' in line:
                in_array = True
            continue

        if stripped in ('];', ');'):
            footer_lines.append(line)
            continue

        m = key_val_pattern.match(line)
        if m:
            key = m.group(1).strip()
            val_part = m.group(2).strip()

            # Bỏ dấu phẩy cuối dòng nếu có
            if val_part.endswith(','):
                val_part = val_part[:-1].strip()

            # Bóc tách quote ngoài cùng nếu là chuỗi đơn giản
            clean_val = val_part
            if (val_part.startswith("'") and val_part.endswith("'")) or \
               (val_part.startswith('"') and val_part.endswith('"')):
                clean_val = val_part[1:-1]

            entries.append({
                'line_no': i,
                'key': key,
                'val': clean_val,
                'raw_val': val_part,
                'raw_line': line
            })
        else:
            # Dòng comment hoặc dòng trống bên trong array
            if in_array and not footer_lines:
                entries.append({
                    'line_no': i,
                    'key': None,
                    'val': None,
                    'raw_val': None,
                    'raw_line': line
                })

    return entries, header_lines, footer_lines


def get_duplicate_key_definitions(entries):
    """
    Tìm các key bị khai báo nhiều hơn 1 lần trong cùng file.
    """
    key_occurrences = defaultdict(list)
    for entry in entries:
        if entry['key']:
            key_occurrences[entry['key']].append(entry)

    duplicates = {k: occ for k, occ in key_occurrences.items() if len(occ) > 1}
    return duplicates, key_occurrences


def clean_duplicate_keys(file_path):
    """
    Dọn dẹp các key trùng lặp trong file: Giữ lại khai báo cuối cùng (last-defined wins).
    Tạo bản backup trước khi ghi.
    """
    entries, header_lines, footer_lines = extract_raw_entries(file_path)
    if not entries:
        return 0

    duplicates, _ = get_duplicate_key_definitions(entries)
    if not duplicates:
        print(f"[✓] File {os.path.basename(file_path)} không có key trùng lặp.")
        return 0

    # Xác định các index cần giữ lại:
    # Với mỗi key trùng, ta chỉ giữ lại vị trí XUẤT HIỆN CUỐI CÙNG (chuẩn PHP array)
    last_seen_for_key = {}
    for idx, entry in enumerate(entries):
        if entry['key']:
            last_seen_for_key[entry['key']] = idx

    # Tạo backup
    bak_path = file_path + '.bak'
    with open(bak_path, 'w', encoding='utf-8') as f:
        with open(file_path, 'r', encoding='utf-8') as src:
            f.write(src.read())
    print(f"[*] Đã tạo backup tại: {bak_path}")

    # Ghi lại nội dung đã lọc
    removed_count = 0
    new_lines = list(header_lines)

    for idx, entry in enumerate(entries):
        k = entry['key']
        if k is None:
            # Giữ dòng comment hoặc trống
            new_lines.append(entry['raw_line'])
            continue

        if last_seen_for_key[k] == idx:
            new_lines.append(entry['raw_line'])
        else:
            removed_count += 1

    if not footer_lines:
        footer_lines = ['];\n']
    new_lines.extend(footer_lines)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

    print(f"[✓] Đã dọn dẹp file {os.path.basename(file_path)}: Đã loại bỏ {removed_count} khai báo key trùng.")
    return removed_count


def find_duplicate_values(entries):
    """
    Gom nhóm các key khác nhau nhưng có chung giá trị (Value trùng nhau hoàn toàn).
    """
    val_to_keys = defaultdict(list)
    for entry in entries:
        if entry['key'] and entry['val'] is not None:
            norm_val = entry['val'].strip()
            # Bỏ qua chuỗi quá ngắn như rỗng hoặc ký tự đặc biệt
            if len(norm_val) >= 2:
                val_to_keys[norm_val].append(entry['key'])

    dup_values = {v: list(set(k_list)) for v, k_list in val_to_keys.items() if len(set(k_list)) > 1}
    return dup_values


def scan_key_usage_in_codebase(all_keys):
    """
    Quét qua các file code (.vue, .js, .php) để đếm số lần sử dụng từng key.
    """
    search_dirs = [
        os.path.join(ROOT_DIR, 'src'),
        os.path.join(ROOT_DIR, 'resources', 'views'),
        os.path.join(ROOT_DIR, 'app')
    ]
    extensions = ('.vue', '.js', '.php', '.blade.php')

    print("[*] Đang quét toàn bộ codebase để kiểm tra mức độ sử dụng của các key i18n...")
    key_usage = {k: 0 for k in all_keys}

    # Gom regex theo từng batch để tối ưu tốc độ
    # Hoặc search text thuần túy
    for s_dir in search_dirs:
        if not os.path.exists(s_dir):
            continue
        for root, _, files in os.walk(s_dir):
            for file in files:
                if any(file.endswith(ext) for ext in extensions):
                    full_p = os.path.join(root, file)
                    # Bỏ qua chính file messages.php
                    if 'messages.php' in full_p:
                        continue
                    try:
                        with open(full_p, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                            for k in all_keys:
                                if k in content:
                                    key_usage[k] += content.count(k)
                    except Exception:
                        pass

    return key_usage


def audit_summary():
    """
    Thực hiện kiểm toán tổng thể và hiển thị thống kê.
    """
    vi_entries, _, _ = extract_raw_entries(VI_PATH)
    en_entries, _, _ = extract_raw_entries(EN_PATH)

    vi_dups, vi_occ = get_duplicate_key_definitions(vi_entries)
    en_dups, en_occ = get_duplicate_key_definitions(en_entries)

    vi_keys_set = set(vi_occ.keys())
    en_keys_set = set(en_occ.keys())

    missing_in_en = vi_keys_set - en_keys_set
    missing_in_vi = en_keys_set - vi_keys_set

    vi_dup_vals = find_duplicate_values(vi_entries)
    en_dup_vals = find_duplicate_values(en_entries)

    print("\n" + "=" * 60)
    print("   BÁO CÁO TỔNG QUAN HỆ THỐNG ĐA NGÔN NGỮ (MESSAGES.PHP)")
    print("=" * 60)
    print(f"[*] File tiếng Việt (VI): {len(vi_entries)} dòng khai báo, {len(vi_keys_set)} unique keys.")
    print(f"[*] File tiếng Anh   (EN): {len(en_entries)} dòng khai báo, {len(en_keys_set)} unique keys.")
    print("-" * 60)
    print(f"[*] Số key bị trùng định nghĩa (Duplicate Keys) trong VI : {len(vi_dups)}")
    print(f"[*] Số key bị trùng định nghĩa (Duplicate Keys) trong EN : {len(en_dups)}")
    print(f"[*] Số key có trong VI nhưng THIẾU trong EN             : {len(missing_in_en)}")
    print(f"[*] Số key có trong EN nhưng THIẾU trong VI             : {len(missing_in_vi)}")
    print("-" * 60)
    print(f"[*] Số nhóm chuỗi có VALUE GIỐNG NHAU (Duplicate Values) VI: {len(vi_dup_vals)}")
    print(f"[*] Số nhóm chuỗi có VALUE GIỐNG NHAU (Duplicate Values) EN: {len(en_dup_vals)}")
    print("=" * 60)

    if vi_dups:
        print("\n[!] Top 5 key bị trùng lặp định nghĩa trong VI:")
        for i, (k, occ) in enumerate(list(vi_dups.items())[:5], 1):
            lines = [str(o['line_no']) for o in occ]
            print(f"   {i}. Key '{k}' xuất hiện {len(occ)} lần tại các dòng: {', '.join(lines)}")

    if vi_dup_vals:
        print("\n[!] Top 5 giá trị tiếng Việt (Values) được khai báo lặp ở nhiều key nhất:")
        sorted_dup_vals = sorted(vi_dup_vals.items(), key=lambda x: len(x[1]), reverse=True)
        for i, (v, k_list) in enumerate(sorted_dup_vals[:5], 1):
            print(f"   {i}. Value: \"{v}\" ({len(k_list)} keys: {', '.join(k_list[:3])}...)")

    print("\n[💡] Gợi ý thao tác:")
    print("  - Chạy `python scripts/clean_and_audit_messages.py --clean-dup-keys` để xóa ngay các key thừa trong từng file.")
    print("  - Chạy `python scripts/clean_and_audit_messages.py --report` để xuất báo cáo chi tiết các nhóm value trùng nhau.\n")


def generate_markdown_report(report_path):
    """
    Tạo báo cáo chi tiết định dạng Markdown.
    """
    vi_entries, _, _ = extract_raw_entries(VI_PATH)
    en_entries, _, _ = extract_raw_entries(EN_PATH)

    vi_dups, vi_occ = get_duplicate_key_definitions(vi_entries)
    en_dups, en_occ = get_duplicate_key_definitions(en_entries)

    vi_keys_set = set(vi_occ.keys())
    en_keys_set = set(en_occ.keys())

    missing_in_en = sorted(list(vi_keys_set - en_keys_set))
    missing_in_vi = sorted(list(en_keys_set - vi_keys_set))

    vi_dup_vals = find_duplicate_values(vi_entries)

    os.makedirs(os.path.dirname(report_path), exist_ok=True)

    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("# Báo Cáo Phân Tích & Tối Ưu Hóa Ngôn Ngữ (messages.php)\n\n")
        f.write(f"- **Tổng số Unique Keys (VI)**: {len(vi_keys_set)}\n")
        f.write(f"- **Tổng số Unique Keys (EN)**: {len(en_keys_set)}\n")
        f.write(f"- **Số key bị trùng định nghĩa (Duplicate Keys) VI**: {len(vi_dups)}\n")
        f.write(f"- **Số key bị trùng định nghĩa (Duplicate Keys) EN**: {len(en_dups)}\n")
        f.write(f"- **Số nhóm Value bị lặp lại trong tiếng Việt**: {len(vi_dup_vals)}\n\n")

        # 1. Duplicate Keys
        f.write("## 1. Danh Sách Key Bị Trùng Định Nghĩa (Duplicate Definitions)\n\n")
        if vi_dups:
            f.write("### Tiếng Việt (VI):\n")
            for k, occ in vi_dups.items():
                lines = [str(o['line_no']) for o in occ]
                f.write(f"- `{k}` ({len(occ)} lần) tại dòng: {', '.join(lines)}\n")
        else:
            f.write("Không có key nào bị trùng định nghĩa trong file VI.\n\n")

        if en_dups:
            f.write("\n### Tiếng Anh (EN):\n")
            for k, occ in en_dups.items():
                lines = [str(o['line_no']) for o in occ]
                f.write(f"- `{k}` ({len(occ)} lần) tại dòng: {', '.join(lines)}\n")
        else:
            f.write("Không có key nào bị trùng định nghĩa trong file EN.\n\n")

        # 2. Duplicate Values
        f.write("\n## 2. Các Nhóm Có Cùng Nội Dung (Duplicate Values)\n\n")
        f.write("Dưới đây là các cụm từ có text tiếng Việt giống hệt nhau nhưng đang được khai báo ở nhiều key khác nhau:\n\n")
        sorted_dup_vals = sorted(vi_dup_vals.items(), key=lambda x: len(x[1]), reverse=True)
        for v, k_list in sorted_dup_vals:
            f.write(f"### Nội dung: \"{v}\" ({len(k_list)} keys)\n")
            for k in k_list:
                f.write(f"- `{k}`\n")
            f.write("\n")

        # 3. Missing Keys
        f.write("\n## 3. Khác Biệt Giữa 2 Ngôn Ngữ\n\n")
        f.write(f"### Có trong VI nhưng thiếu trong EN ({len(missing_in_en)} keys):\n")
        for k in missing_in_en[:100]:
            f.write(f"- `{k}`\n")
        if len(missing_in_en) > 100:
            f.write(f"- ... và {len(missing_in_en) - 100} keys khác.\n")

        f.write(f"\n### Có trong EN nhưng thiếu trong VI ({len(missing_in_vi)} keys):\n")
        for k in missing_in_vi[:100]:
            f.write(f"- `{k}`\n")
        if len(missing_in_vi) > 100:
            f.write(f"- ... và {len(missing_in_vi) - 100} keys khác.\n")

    print(f"[✓] Đã xuất báo cáo chi tiết tại: {report_path}")


def main():
    parser = argparse.ArgumentParser(description="Tool làm sạch và phân tích messages.php")
    parser.add_argument('--audit', action='store_true', help='Kiểm toán và in thống kê tổng quan')
    parser.add_argument('--clean-dup-keys', action='store_true', help='Xóa các khai báo key trùng trong VI & EN')
    parser.add_argument('--find-dup-values', action='store_true', help='Liệt kê các nhóm key có cùng value')
    parser.add_argument('--find-unused', action='store_true', help='Quét source code tìm các key không sử dụng')
    parser.add_argument('--report', type=str, nargs='?', const=os.path.join(ROOT_DIR, 'reports', 'messages_audit.md'),
                        help='Xuất báo cáo chi tiết dạng Markdown')

    args = parser.parse_args()

    # Nếu không có tham số nào, mặc định chạy --audit
    if not (args.audit or args.clean_dup_keys or args.find_dup_values or args.find_unused or args.report):
        audit_summary()
        return

    if args.clean_dup_keys:
        print("[*] Đang thực hiện dọn dẹp key trùng định nghĩa...")
        clean_duplicate_keys(VI_PATH)
        clean_duplicate_keys(EN_PATH)

    if args.find_dup_values:
        vi_entries, _, _ = extract_raw_entries(VI_PATH)
        dup_vals = find_duplicate_values(vi_entries)
        print(f"\n[*] Tìm thấy {len(dup_vals)} nhóm giá trị trùng nhau trong VI:")
        for v, k_list in sorted(dup_vals.items(), key=lambda x: len(x[1]), reverse=True)[:30]:
            print(f"- \"{v}\": {len(k_list)} keys -> {', '.join(k_list)}")

    if args.find_unused:
        vi_entries, _, _ = extract_raw_entries(VI_PATH)
        all_keys = [e['key'] for e in vi_entries if e['key']]
        usage = scan_key_usage_in_codebase(all_keys)
        unused = [k for k, count in usage.items() if count == 0]
        print(f"\n[*] Tổng số key kiểm tra: {len(all_keys)}")
        print(f"[*] Số key không tìm thấy lệnh gọi trong code: {len(unused)}")
        print("Ví dụ 20 key mồ côi (chưa thấy gọi trong codebase):")
        for k in unused[:20]:
            print(f"  - {k}")

    if args.report:
        generate_markdown_report(args.report)

    if args.audit:
        audit_summary()


if __name__ == '__main__':
    main()
