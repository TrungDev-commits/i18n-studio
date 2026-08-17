<?php
 
namespace App\Console\Commands;
 
use Illuminate\Console\Command;
use App\Services\Translation\TranslationManager;
use App\Services\Translation\TranslationNormalizer;
use Illuminate\Support\Facades\DB;
 
class TranslationTranslateJsonCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'translation:translate-json 
                            {input : Đường dẫn file JSON đầu vào chứa mảng các chuỗi cần dịch} 
                            {output : Đường dẫn file JSON đầu ra chứa kết quả dịch}';
 
    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Dịch danh sách chuỗi từ file JSON sang tiếng Anh (EN) và tiếng Trung (ZH) dùng Laravel Translation Engine';
 
    /**
     * Execute the console command.
     *
     * @return mixed
     */
    public function handle()
    {
        $inputPath = $this->argument('input');
        $outputPath = $this->argument('output');
 
        if (!file_exists($inputPath)) {
            $this->error("Không tìm thấy file đầu vào: {$inputPath}");
            return 1;
        }
 
        $jsonContent = file_get_contents($inputPath);
        $texts = json_decode($jsonContent, true);
 
        if (!is_array($texts)) {
            $this->error("Dữ liệu JSON đầu vào không hợp lệ (phải là một mảng chuỗi).");
            return 1;
        }
 
        $this->info("🔄 Đang dịch " . count($texts) . " chuỗi tĩnh sang EN và ZH qua Laravel Translation Engine...");
 
        $manager = new TranslationManager();
        $enTranslations = [];
        $zhTranslations = [];
 
        foreach ($texts as $text) {
            $normalized = TranslationNormalizer::normalize($text);
            if ($normalized === '') {
                $enTranslations[$text] = $text;
                $zhTranslations[$text] = $text;
                continue;
            }
 
            // Gọi đăng ký dịch của Laravel TranslationManager (lưu DB & dịch qua Engine cấu hình)
            try {
                $manager->register($text);
            } catch (\Throwable $e) {
                $this->warn("  ⚠️ Lỗi khi đăng ký dịch chuỗi '{$text}': " . $e->getMessage());
            }
 
            // Truy vấn lại kết quả dịch từ DB translations
            $hash = TranslationNormalizer::hash($normalized);
            $record = DB::table('translations')->where('source_hash', $hash)->first();
 
            if ($record) {
                $enTranslations[$text] = !empty($record->translate_en) ? $record->translate_en : $text;
                $zhTranslations[$text] = !empty($record->translate_zh) ? $record->translate_zh : $text;
            } else {
                $enTranslations[$text] = $text;
                $zhTranslations[$text] = $text;
            }
        }
 
        $outputData = [
            'en' => $enTranslations,
            'zh' => $zhTranslations,
        ];
 
        file_put_contents($outputPath, json_encode($outputData, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        $this->info("✅ Đã dịch thành công và ghi kết quả ra file: {$outputPath}");
 
        return 0;
    }
}
