import os
import sys
import re

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def parse_php_lang_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    keys = {}
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('//') or stripped.startswith('#') or stripped.startswith('/*'):
            continue
        m = re.match(r'''^\s*['"]([^'"]+)['"]\s*=>\s*(.*)$''', line)
        if m:
            k = m.group(1)
            v = m.group(2).rstrip(',').strip()
            keys[k] = v
    return keys

vi_path = os.path.join('resources', 'lang', 'vi', 'messages.php')
en_path = os.path.join('resources', 'lang', 'en', 'messages.php')

vi_keys = parse_php_lang_file(vi_path)
en_keys = parse_php_lang_file(en_path)

# Custom keys to add / ensure
additional_keys = {
    'text_duyet_san_pham_actions': ("'Hành động'", "'Action'"),
    'text_duyet_san_pham_aquaculture': ("'Duyệt sản phẩm'", "'Approve product'"),
    'text_chua_chon_ngay_va_gio': ("'Chưa chọn ngày và giờ'", "'Date and time not selected'"),
    'text_cuon_len_hoac_xuong_de_chon_gio_va_phut': ("'Cuộn lên hoặc xuống để chọn giờ và phút'", "'Scroll up or down to select hour and minute'"),
    'text_danh_muc_cha': ("'Danh mục cha'", "'Parent category'"),
    'text_danh_muc_nay_co_chua_danh_muc_con_xac_nhan_xoa_se_xoa_toan_bo_danh_muc_con_va_danh_muc_cha_nay': (
        "'Danh mục này có chứa danh mục con. Xác nhận xóa sẽ xóa toàn bộ danh mục con và danh mục cha này.'",
        "'This category contains subcategories. Confirming deletion will delete all subcategories and this parent category.'"
    ),
    'text_dong_tim_kiem': ("'Đóng tìm kiếm'", "'Close search'"),
    'text_ghi_chu': ("'Ghi chú'", "'Notes'"),
    'text_hanh_chinh': ("'Hành chính'", "'Administrative'"),
    'text_ve_tinh': ("'Vệ tinh'", "'Satellite'"),
    'text_khoang_cach_tu_chi_cuc_den_co_so': ("'Khoảng cách từ chi cục đến cơ sở'", "'Distance from sub-department to facility'"),
    'text_khong_duoc_de_trong': ("'Không được để trống'", "'Cannot be left blank'"),
    'text_khong_tim_thay_du_lieu_can_cap_nhat': ("'Không tìm thấy dữ liệu cần cập nhật'", "'Data to update not found'"),
    'text_khong_tim_thay_du_lieu_can_xoa': ("'Không tìm thấy dữ liệu cần xóa'", "'Data to delete not found'"),
    'text_loai_mua_1_mua_nho_16mm_2_mua_vua_16_50mm_3_mua_to_51_100mm_4_mua_rat_to_100mm': (
        "'1: Mưa nhỏ (<=16mm), 2: Mưa vừa (16-50mm), 3: Mưa to (51-100mm), 4: Mưa rất to (>100mm)'",
        "'1: Light rain (<=16mm), 2: Moderate rain (16-50mm), 3: Heavy rain (51-100mm), 4: Very heavy rain (>100mm)'"
    ),
    'text_loi_cap_nhat_du_lieu': ("'Lỗi cập nhật dữ liệu'", "'Error updating data'"),
    'text_loi_khi_tai_chi_tiet_tinh': ("'Lỗi khi tải chi tiết tỉnh/thành phố'", "'Error loading province details'"),
    'text_loi_khi_tai_danh_sach_tinh': ("'Lỗi khi tải danh sách tỉnh/thành phố'", "'Error loading province list'"),
    'text_loi_lay_danh_sach_du_lieu': ("'Lỗi lấy danh sách dữ liệu'", "'Error fetching data list'"),
    'text_loi_lay_thong_tin_chi_tiet': ("'Lỗi lấy thông tin chi tiết'", "'Error fetching detail information'"),
    'text_loi_them_moi_du_lieu': ("'Lỗi thêm mới dữ liệu'", "'Error creating new data'"),
    'text_loi_xuat_file_excel': ("'Lỗi xuất file excel'", "'Error exporting excel file'"),
    'text_mat_khau_khong_trung_khop': ("'Mật khẩu xác nhận không trùng khớp'", "'Confirmation password does not match'"),
    'text_nhap_du_lieu_so_ghi_muc_nuoc_tu_excel': ("'Nhập dữ liệu sổ ghi mực nước từ Excel'", "'Import water level logbook data from Excel'"),
    'text_phan_loai_mua': ("'Phân loại mưa'", "'Rainfall classification'"),
    'text_quan_ly_danh_muc': ("'Quản lý danh mục'", "'Category management'"),
    'text_ranh_gioi_tinh_dak_lak': ("'Ranh giới tỉnh'", "'Province boundary'"),
    'text_ten_bieu_mau_khong_duoc_de_trong': ("'Tên biểu mẫu không được để trống'", "'Template name cannot be blank'"),
    'text_ten_danh_muc': ("'Tên danh mục'", "'Category name'"),
    'text_ten_tieng_anh': ("'Tên tiếng Anh'", "'English name'"),
    'text_them_con': ("'Thêm con'", "'Add child'"),
    'text_them_danh_muc_con': ("'Thêm danh mục con'", "'Add subcategory'"),
    'text_them_danh_muc_con_vao': ("'Thêm danh mục con vào'", "'Add subcategory to'"),
    'text_xoa_tat_ca': ("'Xóa tất cả'", "'Clear all'"),
    'text_chu_thich': ("'Chú thích'", "'Legend / Annotation'"),
    'text_dong_row_hinh_thuc_quan_trac_hinhthucraw_khong_hop_le_1_thu_cong_2_cam_bien_iot_3_tu_dong_scana': (
        "\"Dòng :row: Hình thức quan trắc ':hinhThucRaw' không hợp lệ (1: Thủ công, 2: Cảm biến IoT, 3: Tự động SCADA).\"",
        "\"Row :row: Monitoring method ':hinhThucRaw' is invalid (1: Manual, 2: IoT Sensor, 3: SCADA Automatic).\""
    ),
    'text_dong_row_luong_mua_mm_bat_buoc_phai_la_so_hop_le': (
        "'Dòng :row: Lượng mưa (mm) bắt buộc phải là số hợp lệ.'",
        "'Row :row: Rainfall (mm) must be a valid number.'"
    ),
    'text_dong_row_ma_so_ghi_khong_duoc_de_trong': (
        "'Dòng :row: Mã sổ ghi không được để trống.'",
        "'Row :row: Logbook code cannot be blank.'"
    ),
    'text_dong_row_ngay_quan_trac_khong_duoc_de_trong': (
        "'Dòng :row: Ngày quan trắc không được để trống.'",
        "'Row :row: Observation date cannot be blank.'"
    ),
    'text_dong_row_ngay_thoi_gian_quan_trac_displayval_khong_dung_dinh_dang_hh_mm_dd_mm_yyyy_hoac_dd_mm_yyyy': (
        "\"Dòng :row: Ngày/thời gian quan trắc ':displayVal' không đúng định dạng (HH:mm DD/MM/YYYY hoặc DD/MM/YYYY).\"",
        "\"Row :row: Observation date/time ':displayVal' invalid format (HH:mm DD/MM/YYYY or DD/MM/YYYY).\""
    ),
    'text_dong_row_ten_tram_do_khong_duoc_de_trong': (
        "'Dòng :row: Tên trạm đo không được để trống.'",
        "'Row :row: Station name cannot be blank.'"
    ),
    'text_dong_row_ten_vi_tri_tram_quan_trac_khong_duoc_de_trong': (
        "'Dòng :row: Tên/vị trí trạm quan trắc không được để trống.'",
        "'Row :row: Station name/location cannot be blank.'"
    ),
    'text_dong_row_thoi_gian_quan_trac_displayval_khong_dung_dinh_dang_ngay_gio_hh_mm_dd_mm_yyyy_hoac_dd_mm_yyyy_hh_mm': (
        "\"Dòng :row: Thời gian quan trắc ':displayVal' không đúng định dạng ngày giờ (HH:mm DD/MM/YYYY hoặc DD/MM/YYYY HH:mm).\"",
        "\"Row :row: Observation time ':displayVal' invalid datetime format (HH:mm DD/MM/YYYY or DD/MM/YYYY HH:mm).\""
    ),
    'text_dong_row_thoi_gian_quan_trac_khong_duoc_de_trong': (
        "'Dòng :row: Thời gian quan trắc không được để trống.'",
        "'Row :row: Observation time cannot be blank.'"
    ),
    'text_dong_row_trang_thai_trangthairaw_khong_hop_le_1_hoat_dong_0_tam_dung': (
        "\"Dòng :row: Trạng thái ':trangThaiRaw' không hợp lệ (1: Hoạt động, 0: Ngưng hoạt động).\"",
        "\"Row :row: Status ':trangThaiRaw' is invalid (1: Active, 0: Suspended).\""
    ),
    'text_import_du_lieu_thanh_cong_them_moi_inserted_ban_ghi_cap_nhat_updated_ban_ghi': (
        "'Import dữ liệu thành công! Thêm mới: :inserted bản ghi, Cập nhật: :updated bản ghi.'",
        "'Import data successfully! Inserted: :inserted records, Updated: :updated records.'"
    )
}

for k, (v_vi, v_en) in additional_keys.items():
    vi_keys[k] = v_vi
    en_keys[k] = v_en

all_keys = sorted(list(set(vi_keys.keys()).union(set(en_keys.keys()))))

vi_lines = ["<?php", "", "return ["]
en_lines = ["<?php", "", "return ["]

for k in all_keys:
    val_vi = vi_keys.get(k, en_keys.get(k))
    val_en = en_keys.get(k, vi_keys.get(k))
    vi_lines.append(f"    '{k}' => {val_vi},")
    en_lines.append(f"    '{k}' => {val_en},")

vi_lines.append("];\n")
en_lines.append("];\n")

with open(vi_path, 'w', encoding='utf-8') as f:
    f.write("\n".join(vi_lines))

with open(en_path, 'w', encoding='utf-8') as f:
    f.write("\n".join(en_lines))

print(f"Đã cập nhật thành công {len(all_keys)} keys vào cả 2 file.")
