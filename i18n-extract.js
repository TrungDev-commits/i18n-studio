const fs = require('fs');
const path = require('path');
const compiler = require('vue-template-compiler');
const babel = require('@babel/parser');

const ROOT = path.resolve(__dirname, '..');
const LANG_FILES = {
	vi: path.join(ROOT, 'resources', 'lang', 'vi', 'messages.php'),
	en: path.join(ROOT, 'resources', 'lang', 'en', 'messages.php'),
	zh: path.join(ROOT, 'resources', 'lang', 'zh', 'messages.php'),
};

const VN_RX = /[àảãáạăằẳẵắặâầẩẫấậđèẻẽéẹêềểễếệìỉĩíịòỏõóọôồổỗốộơờởỡớợùủũúụưừửữứựỳỷỹýỵÀẢÃÁẠĂẰẲẴẮẶÂẦẨẪẤẬĐÈẺẼÉẸÊỀỂỄẾỆÌỈĨÍỊÒỎÕÓỌÔỒỔỖỐỘƠỜỞỠỚỢÙỦŨÚỤƯỪỬỮỨỰỲỶỸÝỴ]/;
const RUN_RX = /[A-Za-z0-9_À-ỹ][A-Za-z0-9_À-ỹ\s.,:;()&\-'/%\u2013\u2014\u2026\u2022]*/g;

const TRANSLATABLE_ATTRS = new Set([
	'title',
	'placeholder',
	'alt',
	'label',
	'aria-label',
	'arial-label',
	'data-title',
	'data-label',
	'data-tooltip',
	'tooltip',
	'hint',
]);

const SKIP_DIRS = new Set([
	'node_modules',
	'vendor',
	'public',
	'storage',
	'.git',
	'.svn',
	'.idea',
	'dist',
	'build',
	'cache',
]);

const SKIP_FILES = new Set(['vue-i18n-locales.generated.js']);

function mapFieldsToTablesWithoutDb(jsonData, mainTable) {
	const mapped = {};
	const vnRx = /[àảãáạăằẳẵắặâầẩẫấậđèẻẽéẹêềểễếệìỉĩíịòỏõóọôồổỗốộơờởỡớợùủũúụưừửữứựỳỷỹýỵÀẢÃÁẠĂẰẲẴẮẶÂẦẨẪẤẬĐÈẺẼÉẸÊỀỂỄẾỆÌỈĨÍỊÒỎÕÓỌÔỒỔỖỐỘƠỜỞỠỚỢÙỦŨÚỤƯỪỬỮỨỰỲỶỸÝỴ]/;

	let prefix = '';
	const parts = mainTable.split('_');
	if (parts.length > 1) {
		parts.pop();
		prefix = parts.join('_');
	}

	const scan = (data, currentTable) => {
		if (!data || typeof data !== 'object') return;

		for (const key of Object.keys(data)) {
			const val = data[key];
			if (val && typeof val === 'object') {
				let nextTable = currentTable;
				if (isNaN(key)) {
					const singular = key.endsWith('s') ? key.slice(0, -1) : key;
					const cleanSingular = singular.replace(/_/g, '');
					nextTable = prefix ? `${prefix}_${cleanSingular}` : cleanSingular;
				}
				scan(val, nextTable);
			} else if (typeof val === 'string' && vnRx.test(val)) {
				const ignored = ['id', 'created_at', 'updated_at', 'commune_code', 'image', 'images', 'album_images', 'tourism_images'];
				if (ignored.includes(key)) continue;

				if (!mapped[currentTable]) mapped[currentTable] = [];
				if (!mapped[currentTable].includes(key)) {
					mapped[currentTable].push(key);
				}
			}
		}
	};

	scan(jsonData, mainTable);
	return mapped;
}

function updateTranslationConfig(tableName, fields) {
	const configPath = path.join(ROOT, 'config', 'translation.php');
	if (!fs.existsSync(configPath)) {
		console.error(`❌ Không tìm thấy file config: ${configPath}`);
		return;
	}

	let content = fs.readFileSync(configPath, 'utf8');
	fields = [...new Set(fields)].sort();

	const tablePattern = new RegExp(`'${tableName}'\\s*=>\\s*\\[`);

	if (tablePattern.test(content)) {
		const match = content.match(tablePattern);
		const startPos = match.index;

		const fieldsIndex = content.indexOf("'fields' => [", startPos);
		if (fieldsIndex !== -1) {
			const closeBracketPos = content.indexOf(']', fieldsIndex);
			if (closeBracketPos !== -1) {
				const fieldsBlock = content.slice(fieldsIndex, closeBracketPos);

				const existingFields = [];
				const re = /'([^']+)'/g;
				let m;
				while ((m = re.exec(fieldsBlock))) {
					if (m[1] !== 'fields') {
						existingFields.push(m[1]);
					}
				}

				const newFields = fields.filter(f => !existingFields.includes(f));
				if (newFields.length > 0) {
					let insertStr = '';
					for (const nf of newFields) {
						insertStr += `\n                '${nf}',`;
					}
					content = content.slice(0, closeBracketPos) + insertStr + '\n            ' + content.slice(closeBracketPos);
					fs.writeFileSync(configPath, content, 'utf8');
					console.log(`   -> Bảng [${tableName}]: Đã thêm trường mới: ${newFields.join(', ')}`);
				} else {
					console.log(`   -> Bảng [${tableName}]: Các trường đã tồn tại đầy đủ.`);
				}
			}
		}
	} else {
		const tablesIndex = content.indexOf("'tables' => [");
		if (tablesIndex !== -1) {
			const insertPos = tablesIndex + "'tables' => [".length;
			let configStr = `\n        '${tableName}' => [\n            'primary_key' => 'id',\n            'fields' => [\n`;
			for (const f of fields) {
				configStr += `                '${f}',\n`;
			}
			configStr += `            ],\n        ],\n`;

			content = content.slice(0, insertPos) + configStr + content.slice(insertPos);
			fs.writeFileSync(configPath, content, 'utf8');
			console.log(`   -> Bảng [${tableName}]: Đã thêm cấu hình mới vào config/translation.php`);
		}
	}
}

function updateMiddlewareConfig(fields) {
	const middlewarePath = path.join(ROOT, 'app', 'Http', 'Middleware', 'AutoTranslateResponseMiddleware.php');
	if (!fs.existsSync(middlewarePath)) {
		console.warn(`⚠️ Không tìm thấy file Middleware: ${middlewarePath}`);
		return;
	}

	let content = fs.readFileSync(middlewarePath, 'utf8');
	const keyBlockPattern = /private static \$translatableKeys = \[(?:[^\]]+)\];/;
	const match = content.match(keyBlockPattern);

	if (match) {
		const block = match[0];
		const existingKeys = [];
		const re = /'([^']+)'/g;
		let m;
		while ((m = re.exec(block))) {
			existingKeys.push(m[1]);
		}

		const newKeys = fields.filter(f => !existingKeys.includes(f));
		if (newKeys.length > 0) {
			const insertPos = block.lastIndexOf('];');
			if (insertPos !== -1) {
				let insertStr = '';
				for (const nk of newKeys) {
					insertStr += `\n        '${nk}',`;
				}
				const newBlock = block.slice(0, insertPos) + insertStr + '\n    ' + block.slice(insertPos);
				content = content.replace(block, newBlock);
				fs.writeFileSync(middlewarePath, content, 'utf8');
				console.log(`   -> Middleware: Đã thêm các trường cần dịch: ${newKeys.join(', ')}`);
			}
		} else {
			console.log(`   -> Middleware: Các trường đã cấu hình dịch đầy đủ.`);
		}
	} else {
		console.warn('⚠️ Không tìm thấy $translatableKeys trong Middleware.');
	}
}

const options = {
	dryRun: false,
	noTranslate: false,
	backup: false,
	prefix: 'text_',
	apiRoute: null,
	table: null,
};

function usage() {
	console.log(`Cách dùng: node scripts/i18n-extract.js <file|thư-mục...> [tùy chọn]

  Quét .vue / .js / .blade.php, trích chuỗi tiếng Việt hardcode, tạo khóa
  snake_case, dịch vi->en/zh, ghi thêm vào 3 file resources/lang/*/messages.php
  rồi refactor nguồn sang $t('messages.key').

  Hoặc quét API và bảng DB để phát hiện các trường tiếng Việt cần dịch dữ liệu động,
  tự động cập nhật config/translation.php và dịch DB sang EN/ZH:
    node scripts/i18n-extract.js --api-route=xxx --table=yyy

  <file|thư-mục...>   Một hoặc nhiều file / thư mục (quét đệ quy).

  Tùy chọn:
    --dry-run        Chỉ báo cáo, không ghi file, không gọi dịch.
    --no-translate   Không gọi Google dịch; en/zh dùng tạm giá trị tiếng Việt.
    --prefix=xxx     Tiền tố khóa (mặc định text_). Ví dụ --prefix=map_
    --backup         Sao lưu .bak cho 3 file messages.php trước khi ghi.
    --api-route=xxx  Đường dẫn API (ví dụ: api-ui/quan-ly-gioi-thieu-xa-phuong/detail)
    --table=xxx      Bảng database tương ứng (ví dụ: gioi_thieu_xa_phuong)

  Ví dụ:
    node scripts/i18n-extract.js src/components/mapCommon.vue
    node scripts/i18n-extract.js src/views --dry-run --no-translate
    node scripts/i18n-extract.js resources/views/login.blade.php --prefix=text_
    node scripts/i18n-extract.js --api-route=api/getInfoOcop/321 --table=sanpham_ocop
`);
	process.exit(1);
}

function parseArgs(argv) {
	const paths = [];
	for (const a of argv) {
		if (a === '--dry-run') options.dryRun = true;
		else if (a === '--no-translate') options.noTranslate = true;
		else if (a === '--backup') options.backup = true;
		else if (a.startsWith('--prefix=')) options.prefix = a.slice('--prefix='.length);
		else if (a.startsWith('--api-route=')) options.apiRoute = a.slice('--api-route='.length);
		else if (a.startsWith('--table=')) options.table = a.slice('--table='.length);
		else if (a.startsWith('-')) usage();
		else paths.push(a);
	}
	if (!paths.length && !options.apiRoute && !options.table) usage();
	return paths;
}

function collectFiles(inputs) {
	const files = new Set();
	for (const input of inputs) {
		const abs = path.resolve(process.cwd(), input);
		if (!fs.existsSync(abs)) {
			console.warn(`Bỏ qua (không tồn tại): ${input}`);
			continue;
		}
		const stat = fs.statSync(abs);
		if (stat.isFile()) {
			if (isScannable(abs)) files.add(abs);
			continue;
		}
		const walk = (dir) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (SKIP_DIRS.has(entry.name)) continue;
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (entry.isFile() && isScannable(full)) files.add(full);
			}
		};
		walk(abs);
	}
	return [...files].sort();
}

function isScannable(file) {
	const base = path.basename(file);
	if (base.endsWith('.blade.php')) return true;
	const ext = path.extname(file).toLowerCase();
	if (ext !== '.vue' && ext !== '.js') return false;
	if (SKIP_FILES.has(base)) return false;
	if (file.includes(path.sep + 'lang' + path.sep)) return false;
	return true;
}

function slugify(str) {
	return str
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/đ/g, 'd')
		.replace(/Đ/g, 'd')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean)
		.join('_');
}

function escapePhp(s) {
	return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function findRuns(text, cb) {
	RUN_RX.lastIndex = 0;
	let m;
	while ((m = RUN_RX.exec(text))) {
		const run = m[0].trim();
		if (run.length < 2 || !VN_RX.test(run)) continue;
		const relStart = m.index + m[0].indexOf(run);
		cb(run, relStart);
	}
}

function locateInFile(fileSrc, expected, from) {
	if (from == null) from = 0;
	const idx = fileSrc.indexOf(expected, Math.max(0, from));
	return idx >= 0 ? idx : -1;
}

function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findAllMatches(str, re) {
	const out = [];
	let m;
	re.lastIndex = 0;
	while ((m = re.exec(str))) out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
	return out;
}

function nearestMatch(matches, approx) {
	let best = null;
	let bestDist = Infinity;
	for (const m of matches) {
		const d = Math.abs(m.start - approx);
		if (d < bestDist) {
			bestDist = d;
			best = m;
		}
	}
	return best;
}

function locateAttr(content, name, value, approx) {
	const re = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*["']${escapeRegExp(value)}["']`, 'g');
	return nearestMatch(findAllMatches(content, re), approx);
}

function extractTemplate(tpl, parseSrc, file, occurrences, reviews) {
	if (!tpl || typeof tpl.start !== 'number') return;
	const contentStart = tpl.start;
	const content = typeof tpl.end === 'number' ? parseSrc.slice(contentStart, tpl.end) : tpl.content || '';
	if (!content.trim()) return;

	let compiled;
	try {
		compiled = compiler.compile(content, { outputSourceRange: true });
	} catch (e) {
		reviews.push({ file, msg: `Không compile được template: ${e.message}` });
		return;
	}
	if (compiled.errors && compiled.errors.length) {
		reviews.push({ file, msg: `Template có lỗi compile (${compiled.errors.length}): ${compiled.errors[0].msg}` });
	}

	const handleAttr = (attr) => {
		const name = attr.name;
		const value = attr.value;
		if (!value || !VN_RX.test(value)) return;
		const isBound = name.startsWith(':') || name.startsWith('v-bind:');
		let vi;
		let attrName;
		if (isBound) {
			if (/^v-(html|text)$/.test(name)) return;
			const m = /^(['"])(.*)\1$/s.exec(value.trim());
			if (!m) {
				reviews.push({ file, msg: `Biểu thức thuộc tính ${name} phức tạp — duyệt thủ công: ${JSON.stringify(value)}` });
				return;
			}
			vi = m[2];
			if (!VN_RX.test(vi)) return;
			attrName = name.replace(/^v-bind:/, ':');
		} else {
			if (!TRANSLATABLE_ATTRS.has(name)) return;
			vi = value;
			attrName = ':' + name;
		}
		if (/\{[\sA-Za-z0-9_]+\}/.test(vi)) {
			reviews.push({ file, msg: `Chuỗi thuộc tính có tham số {param} — duyệt thủ công: ${JSON.stringify(vi)}` });
			return;
		}
		const match = locateAttr(content, name, isBound ? value.trim() : value, attr.start);
		if (!match) {
			reviews.push({ file, msg: `Không định vị được thuộc tính ${name} — bỏ qua: ${JSON.stringify(value)}` });
			return;
		}
		occurrences.push({
			file,
			start: contentStart + match.start,
			end: contentStart + match.end,
			verifyOriginal: match.text,
			vi,
			kind: 'template-attr',
			attrName,
		});
	};

	const walk = (n) => {
		if (!n || typeof n !== 'object') return;
		if (n.type === 3 && typeof n.text === 'string' && !n.isComment) {
			const text = n.text;
			if (!VN_RX.test(text)) return;
			const re = new RegExp(escapeRegExp(text), 'g');
			const match = nearestMatch(findAllMatches(content, re), n.start || 0);
			if (!match) return;
			const textStart = match.start;
			findRuns(text, (run, relStart) => {
				const abs = contentStart + textStart + relStart;
				const absEnd = abs + run.length;
				if (parseSrc.slice(abs, absEnd) !== run) return;
				occurrences.push({ file, start: abs, end: absEnd, verifyOriginal: run, vi: run, kind: 'template-text' });
			});
			return;
		}
		if (n.type === 1) {
			(n.attrsList || []).forEach(handleAttr);
			(n.children || []).forEach(walk);
		}
		(n.ifConditions || []).forEach((c) => c.block && c.block !== n && walk(c.block));
	};
	walk(compiled.ast);
}

function calleeName(callee) {
	if (!callee) return '';
	if (callee.type === 'Identifier') return callee.name;
	if (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') {
		const obj = calleeName(callee.object);
		const prop = callee.computed || !callee.property ? '' : callee.property.name;
		return obj ? `${obj}.${prop}` : prop;
	}
	return '';
}

function isTranslationCall(callee) {
	const name = calleeName(callee);
	return (
		name === '$t' ||
		name === 't' ||
		name === 'trans' ||
		name === '__' ||
		name === 'this.$t' ||
		/\.t$/.test(name)
	);
}

function isExcludedParent(parent, node) {
	if (!parent) return false;
	if (parent.type === 'ObjectProperty' && !parent.computed && parent.key === node) return true;
	if (
		parent.type === 'ImportDeclaration' ||
		parent.type === 'ExportNamedDeclaration' ||
		parent.type === 'ExportAllDeclaration'
	) {
		if (parent.source === node) return true;
	}
	if (parent.type === 'CallExpression' || parent.type === 'OptionalCallExpression') {
		if (parent.callee && isTranslationCall(parent.callee) && node === parent.arguments[0]) return true;
		if (parent.callee && calleeName(parent.callee) === 'require' && node === parent.arguments[0]) return true;
		if (parent.callee && parent.callee.type === 'Import' && node === parent.arguments[0]) return true;
	}
	if (parent.type === 'TaggedTemplateExpression') return true;
	return false;
}

function isFunctionLike(node) {
	return (
		node.type === 'FunctionDeclaration' ||
		node.type === 'FunctionExpression' ||
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'ObjectMethod' ||
		node.type === 'ClassMethod' ||
		node.type === 'ClassPrivateMethod'
	);
}

function extractScript(block, parseSrc, file, occurrences, reviews) {
	const contentStart = typeof block.start === 'number' ? block.start : 0;
	const content = typeof block.end === 'number' ? parseSrc.slice(contentStart, block.end) : block.content || '';
	if (!content.trim()) return;

	let ast;
	try {
		ast = babel.parse(content, { sourceType: 'module', allowReturnOutsideFunction: true });
	} catch (e) {
		try {
			ast = babel.parse(content, { sourceType: 'script', allowReturnOutsideFunction: true });
		} catch (e2) {
			reviews.push({ file, msg: `Không parse được <script>: ${e2.message}` });
			return;
		}
	}

	const state = { inFunction: 0 };

	const handleLiteral = (node, parent, valueOverride) => {
		const value = valueOverride !== undefined ? valueOverride : node.value;
		if (typeof value !== 'string') return;
		if (value.length < 2 || !VN_RX.test(value)) return;
		if (isExcludedParent(parent, node)) return;
		if (value.startsWith('messages.')) return;
		if (/\{[\sA-Za-z0-9_]+\}/.test(value)) {
			reviews.push({ file, msg: `Chuỗi có tham số {param} — duyệt thủ công: ${JSON.stringify(value)}` });
			return;
		}
		const raw = content.slice(node.start, node.end);
		const start = contentStart + node.start;
		if (parseSrc.slice(start, start + raw.length) !== raw) {
			reviews.push({ file, msg: `Không định vị được chuỗi: ${JSON.stringify(value)}` });
			return;
		}
		if (state.inFunction === 0 && file.endsWith('.vue')) {
			reviews.push({ file, msg: `Chuỗi ở phạm vi module (không tự refactor) — duyệt thủ công: ${JSON.stringify(value)}` });
			return;
		}
		occurrences.push({
			file,
			start,
			end: start + raw.length,
			verifyOriginal: raw,
			vi: value,
			kind: file.endsWith('.vue') ? 'vue-script' : 'js-script',
		});
	};

	const walk = (node, parent) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			node.forEach((n) => walk(n, parent));
			return;
		}
		if (node.type === 'StringLiteral') {
			handleLiteral(node, parent);
			return;
		}
		if (node.type === 'TemplateLiteral') {
			if (node.expressions && node.expressions.length === 0 && node.quasis && node.quasis.length === 1) {
				const val = node.quasis[0].value.cooked;
				handleLiteral(node, parent, val);
			}
			return;
		}
		const wasFn = isFunctionLike(node);
		if (wasFn) state.inFunction++;
		const nextParent = node;
		for (const key of Object.keys(node)) {
			if (
				key === 'start' ||
				key === 'end' ||
				key === 'loc' ||
				key === 'range' ||
				key.endsWith('Comments')
			) {
				continue;
			}
			const v = node[key];
			if (v && typeof v === 'object') walk(v, nextParent);
		}
		if (wasFn) state.inFunction--;
	};
	walk(ast, null);
}

function maskBlade(src) {
	let masked = src;
	const masks = [
		/<style[\s\S]*?<\/style>/gi,
		/<script[\s\S]*?<\/script>/gi,
		/<!--[\s\S]*?-->/g,
		/\{\{--[\s\S]*?--\}\}/g,
		/@php[\s\S]*?@endphp/g,
		/@\w+/g,
		/\{!![\s\S]*?!!\}/g,
		/\{\{[\s\S]*?\}\}/g,
	];
	for (const re of masks) masked = masked.replace(re, (m) => '#'.repeat(m.length));
	return masked;
}

function bladeContext(src, idx) {
	for (let i = idx - 1; i >= 0; i--) {
		const c = src[i];
		if (c === '<' || c === '>') return c === '>' ? 'text' : 'attr';
	}
	return 'text';
}

function bladeAttrName(src, idx) {
	let quote = -1;
	for (let i = idx - 1; i >= 0; i--) {
		const c = src[i];
		if (c === '"' || c === "'") {
			quote = i;
			break;
		}
		if (c === '<' || c === '>') return null;
	}
	if (quote < 0) return null;
	const eq = src.lastIndexOf('=', quote - 1);
	if (eq < 0) return null;
	const m = /([A-Za-z][A-Za-z0-9_-]*)\s*$/.exec(src.slice(0, eq));
	return m ? m[1] : null;
}

function extractBlade(fileSrc, file, occurrences, reviews) {
	const masked = maskBlade(fileSrc);
	findRuns(masked, (run, relStart) => {
		const start = relStart;
		const end = start + run.length;
		if (fileSrc.slice(start, end) !== run) return;
		const ctx = bladeContext(masked, start);
		if (ctx === 'attr') {
			const name = bladeAttrName(masked, start);
			if (!name || !TRANSLATABLE_ATTRS.has(name)) return;
			occurrences.push({ file, start, end, verifyOriginal: run, vi: run, kind: 'blade-attr' });
		} else {
			occurrences.push({ file, start, end, verifyOriginal: run, vi: run, kind: 'blade-text' });
		}
	});
}

function extractFile(file, occurrences, reviews) {
	const fileSrc = fs.readFileSync(file, 'utf8');
	if (file.endsWith('.blade.php')) {
		extractBlade(fileSrc, file, occurrences, reviews);
		return;
	}
	const ext = path.extname(file).toLowerCase();
	if (ext === '.vue') {
		const parseSrc = fileSrc.replace(/\r\n/g, '\n');
		let sfc;
		try {
			sfc = compiler.parseComponent(parseSrc);
		} catch (e) {
			reviews.push({ file, msg: `Không parse được SFC: ${e.message}` });
			return;
		}
		if (sfc.template) extractTemplate(sfc.template, parseSrc, file, occurrences, reviews);
		if (sfc.script) extractScript(sfc.script, parseSrc, file, occurrences, reviews);
	} else if (ext === '.js') {
		const lfSrc = fileSrc.replace(/\r\n/g, '\n');
		extractScript({ start: 0, end: lfSrc.length }, lfSrc, file, occurrences, reviews);
	}
}

function readLang(filePath) {
	const src = fs.readFileSync(filePath, 'utf8');
	const keys = new Set();
	const keyValueMap = {};
	const valueKeyMap = {};
	const re = /^\s*'([^']+)'\s*=>\s*(['"])((?:[^\\]|\\.)*?)\2,/gm;
	let m;
	while ((m = re.exec(src))) {
		const key = m[1];
		let val = m[3];
		if (m[2] === "'") {
			val = val.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
		} else {
			val = val.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
		}
		keys.add(key);
		keyValueMap[key] = val;
		if (!valueKeyMap[val]) {
			valueKeyMap[val] = key;
		}
	}
	return { src, keys, keyValueMap, valueKeyMap };
}

function appendToLang(filePath, entries) {
	const src = fs.readFileSync(filePath, 'utf8');
	const marker = '];';
	const idx = src.lastIndexOf(marker);
	if (idx < 0) throw new Error(`Không tìm thấy "];" trong ${filePath}`);
	const block = entries.map(([k, v]) => `    '${escapePhp(k)}' => '${escapePhp(v)}',`).join('\n');
	const out = src.slice(0, idx) + block + '\n' + src.slice(idx);
	fs.writeFileSync(filePath, out, 'utf8');
}

function formatReplacement(occ, key) {
	const full = `messages.${key}`;
	switch (occ.kind) {
		case 'template-text':
			return `{{ $t('${full}') }}`;
		case 'template-attr':
			return `${occ.attrName}="$t('${full}')"`;
		case 'vue-script':
			return `this.$t('${full}')`;
		case 'js-script':
			return `window.i18n.t('${full}')`;
		case 'blade-text':
		case 'blade-attr':
			return `{{ __('${full}') }}`;
		default:
			throw new Error(`Loại chưa biết: ${occ.kind}`);
	}
}

async function translateViaGoogle(texts, targetLang) {
	const target = targetLang === 'zh' ? 'zh-CN' : targetLang;
	const base = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=vi&tl=${target}&dt=t&q=`;
	const delim = '\n===DIV===\n';
	const out = {};
	const timeoutMs = 4000; // Giảm xuống 4s để tránh bị treo quá lâu

	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	async function fetchOne(url) {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), timeoutMs);
		try {
			const res = await fetch(url, {
				signal: ctrl.signal,
				headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			let joined = '';
			(json[0] || []).forEach((s) => {
				if (s && s[0]) joined += s[0];
			});
			return joined;
		} finally {
			clearTimeout(timer);
		}
	}

	console.log(`[Dịch] Bắt đầu dịch ${texts.length} chuỗi sang [${targetLang.toUpperCase()}]...`);

	for (let i = 0; i < texts.length; i += 15) {
		const chunk = texts.slice(i, i + 15);
		const currentProgress = Math.min(i + 15, texts.length);
		console.log(`   -> [${targetLang.toUpperCase()}] Đang xử lý nhóm từ ${i + 1} đến ${currentProgress}/${texts.length}...`);

		const url = base + encodeURIComponent(chunk.join(delim));
		let ok = false;

		try {
			await sleep(300); // Nghỉ 300ms tránh spam request
			const joined = await fetchOne(url);
			const parts = joined.split(delim);
			if (parts.length === chunk.length) {
				chunk.forEach((t, k) => {
					out[t] = parts[k].trim() || t;
				});
				ok = true;
			} else {
				throw new Error('Số phân đoạn không khớp');
			}
		} catch (e) {
			console.warn(`   ⚠️ Lỗi khi dịch nhóm (hoặc timeout). Sẽ chuyển sang dịch từng từ một...`);
			const failed = [];
			for (const t of chunk) {
				try {
					await sleep(200); // Nghỉ ngắn giữa các từ đơn
					const joined = await fetchOne(base + encodeURIComponent(t));
					out[t] = joined.trim() || t;
				} catch (e2) {
					out[t] = t;
					failed.push(t);
				}
			}
			if (failed.length) {
				console.warn(`   ❌ Không dịch được ${failed.length} chuỗi sang [${targetLang.toUpperCase()}] — giữ nguyên tiếng Việt.`);
			}
		}
	}
	return out;
}

async function main() {
	const inputs = parseArgs(process.argv.slice(2));

	if (options.apiRoute || options.table) {
		if (!options.apiRoute || !options.table) {
			console.error('❌ Lỗi: Khi quét dịch dữ liệu động DB, bạn bắt buộc phải truyền cả --api-route=xxx và --table=yyy');
			process.exit(1);
		}

		const runApiScan = async () => {
			const https = require('https');
			const http = require('http');

			const httpGetJson = (url) => {
				return new Promise((resolve, reject) => {
					const client = url.startsWith('https') ? https : http;
					const req = client.get(url, {
						headers: {
							'X-App-Locale': 'vi',
							'Accept': 'application/json',
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
						}
					}, (res) => {
						let data = '';
						res.on('data', (chunk) => { data += chunk; });
						res.on('end', () => {
							if (res.statusCode !== 200) {
								reject(new Error(`HTTP Error ${res.statusCode}`));
								return;
							}
							try {
								resolve(JSON.parse(data));
							} catch (e) {
								reject(new Error(`Không thể parse JSON: ${e.message}`));
							}
						});
					});
					req.on('error', (err) => {
						reject(err);
					});
				});
			};

			const cleanRoute = '/' + options.apiRoute.replace(/^\//, '');
			const baseUrl = (() => {
				try {
					const envPath = path.join(ROOT, '.env');
					if (fs.existsSync(envPath)) {
						const content = fs.readFileSync(envPath, 'utf8');
						const match = content.match(/^VUE_APP_API_URL\s*=\s*(.*)$/m);
						if (match) {
							return match[1].trim().replace(/['"]/g, '');
						}
					}
				} catch (e) {}
				return 'https://bandoso-daklak.rynansaas.com';
			})();

			let finalRoute = cleanRoute;
			if (cleanRoute.endsWith('/detail') || cleanRoute.endsWith('/detail/') || cleanRoute.includes('{id}')) {
				console.log('🔍 Route thiếu ID cụ thể. Đang tự động tìm một xã có dữ liệu giới thiệu hoạt động...');
				try {
					const listUrl = `${baseUrl.replace(/\/$/, '')}/api-ui/quan-ly-gioi-thieu-xa-phuong/get-active-communes`;
					const listJson = await httpGetJson(listUrl);
					const activeCodes = listJson.data || listJson;
					if (Array.isArray(activeCodes) && activeCodes.length > 0) {
						const sampleCode = activeCodes[0];
						console.log(`   -> Tìm thấy mã xã có dữ liệu: ${sampleCode}`);
						if (cleanRoute.includes('{id}')) {
							finalRoute = cleanRoute.replace('{id}', sampleCode);
						} else {
							finalRoute = cleanRoute.replace(/\/$/, '') + '/' + sampleCode;
						}
					} else {
						console.warn('   ⚠️ Không tìm thấy xã nào có dữ liệu hoạt động. Sẽ thử ID mặc định là 1...');
						finalRoute = cleanRoute.replace(/\/$/, '') + '/1';
					}
				} catch (e) {
					console.warn('   ⚠️ Lỗi khi lấy danh sách xã hoạt động. Sẽ thử ID mặc định là 1...');
					finalRoute = cleanRoute.replace(/\/$/, '') + '/1';
				}
			}

			const fullUrl = `${baseUrl.replace(/\/$/, '')}${finalRoute}`;
			console.log(`🔄 Đang gọi API từ URL thực tế (Không chạm Database): ${fullUrl}...`);

			try {
				const json = await httpGetJson(fullUrl);

				if (json.success === false) {
					throw new Error(json.content || json.message || 'API trả về trạng thái thất bại.');
				}

				const targetData = json.data || json;

				if (!targetData || Object.keys(targetData).length === 0) {
					console.error('❌ Không nhận được dữ liệu hợp lệ từ API.');
					process.exit(1);
				}

				console.log('🎉 Gọi API thành công! Đang phân tích cấu trúc JSON để phát hiện các trường cần dịch...');
				const mappedTables = mapFieldsToTablesWithoutDb(targetData, options.table);

				if (Object.keys(mappedTables).length === 0) {
					console.log('⚠️ Không tìm thấy trường dữ liệu nào chứa tiếng Việt có dấu.');
					return;
				}

				console.log('\nKết quả phát hiện các trường cần dịch:');
				for (const tbl of Object.keys(mappedTables)) {
					console.log(`  - Bảng [${tbl}]: ${mappedTables[tbl].join(', ')}`);
				}

				console.log('\n🔄 Đang cập nhật config/translation.php...');
				for (const tbl of Object.keys(mappedTables)) {
					updateTranslationConfig(tbl, mappedTables[tbl]);
				}

				console.log('\n🔄 Đang cập nhật AutoTranslateResponseMiddleware.php...');
				const allFields = [];
				for (const tbl of Object.keys(mappedTables)) {
					allFields.push(...mappedTables[tbl]);
				}
				updateMiddlewareConfig(allFields);

				console.log('\n✅ Hoàn thành cập nhật cấu hình dịch!');
				console.log('\n💡 GỢI Ý REFACTOR ĐỊA CHỈ (diachi, tinhthanh, phuongxa) TRONG CONTROLLER:');
				console.log('  Thay vì gộp địa chỉ thủ công, hãy sử dụng TranslationHelper:');
				console.log('  -------------------------------------------------------------');
				console.log('  $fullAddress = TranslationHelper::formatAddressWithProvince($base->diachi, $base->listfullprovince);');
				console.log('  $tinhThanh = \'Đang cập nhật\';');
				console.log('  $phuongXa = \'Đang cập nhật\';');
				console.log('  $targetLang = TranslationHelper::resolveTargetLanguage();');
				console.log('  if (isset($base->listfullprovince)) {');
				console.log('      $provinceArr = json_decode($base->listfullprovince, true);');
				console.log('      if (is_array($provinceArr)) {');
				console.log('          $map = TranslationHelper::getProvinceMap();');
				console.log('          foreach ($provinceArr as $p) {');
				console.log('              $level = (int)($p[\'Level\'] ?? 0);');
				console.log('              $code = isset($p[\'ProvinceCode\']) ? (string)$p[\'ProvinceCode\'] : null;');
				console.log('              $pName = $p[\'ProvinceName\'] ?? \'\';');
				console.log('              if ($code && isset($map[$code])) {');
				console.log('                  $pName = $map[$code][$targetLang] ?? $pName;');
				console.log('              }');
				console.log('              if ($level === 1) $tinhThanh = $pName;');
				console.log('              elseif ($level === 3) $phuongXa = $pName;');
				console.log('          }');
				console.log('      }');
				console.log('  }');
				console.log('  -------------------------------------------------------------');
				console.log('Dừng tại đây. Không có bất kỳ truy vấn hay tác động nào xuống database.');

			} catch (err) {
				console.error('❌ Lỗi khi thực thi quét API:', err.message);
				process.exit(1);
			}
		};

		await runApiScan();
		return;
	}

	const files = collectFiles(inputs);

	const occurrences = [];
	const reviews = [];
	for (const file of files) extractFile(file, occurrences, reviews);

	if (!files.length && !occurrences.length) {
		console.log('Không tìm thấy file .vue / .js / .blade.php để quét.');
		return;
	}

	const lang = {};
	for (const code of ['vi', 'en', 'zh']) lang[code] = readLang(LANG_FILES[code]);
	const existingKeys = new Set(lang.vi.keys);

	const uniqueStrings = [];
	const viSet = new Set();
	const keyByVi = {};

	for (const occ of occurrences) {
		const vi = occ.vi;
		if (lang.vi.valueKeyMap && lang.vi.valueKeyMap[vi]) {
			keyByVi[vi] = lang.vi.valueKeyMap[vi];
			continue;
		}

		if (!viSet.has(vi)) {
			viSet.add(vi);
			uniqueStrings.push(vi);
		}
	}

	let enTranslations = {};
	let zhTranslations = {};
	if (!options.dryRun && !options.noTranslate && uniqueStrings.length > 0) {
		const { execSync } = require('child_process');
		const tempDir = path.join(ROOT, 'storage', 'framework', 'cache');
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, { recursive: true });
		}
		const tempIn = path.join(tempDir, `translate_in_${Date.now()}.json`);
		const tempOut = path.join(tempDir, `translate_out_${Date.now()}.json`);

		fs.writeFileSync(tempIn, JSON.stringify(uniqueStrings, null, 2), 'utf8');

		console.log('🔄 Đang gọi Laravel Artisan để dịch Anh - Trung bằng Translation Engine...');
		try {
			execSync(`php artisan translation:translate-json "${tempIn}" "${tempOut}"`, { stdio: 'inherit' });
			if (fs.existsSync(tempOut)) {
				const result = JSON.parse(fs.readFileSync(tempOut, 'utf8'));
				enTranslations = result.en || {};
				zhTranslations = result.zh || {};
			}
		} catch (err) {
			console.warn('⚠️ Lỗi khi chạy lệnh dịch qua Laravel Artisan. Sẽ dùng phương thức dịch trực tiếp của Google từ script làm fallback...');
			enTranslations = await translateViaGoogle(uniqueStrings, 'en');
			zhTranslations = await translateViaGoogle(uniqueStrings, 'zh');
		} finally {
			if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);
			if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
		}
	}

	for (const vi of uniqueStrings) {
		let base = slugify(vi);
		if (!base) base = 'chuoi';
		let key = options.prefix + base;
		let n = 2;
		while (existingKeys.has(key)) {
			key = `${options.prefix}${base}_${n}`;
			n++;
		}
		existingKeys.add(key);
		keyByVi[vi] = key;
	}

	for (const occ of occurrences) occ.key = keyByVi[occ.vi];

	const viEntries = [];
	const enEntries = [];
	const zhEntries = [];
	for (const vi of uniqueStrings) {
		const key = keyByVi[vi];
		viEntries.push([key, vi]);
		enEntries.push([key, options.noTranslate || options.dryRun ? vi : (enTranslations[vi] || vi)]);
		zhEntries.push([key, options.noTranslate || options.dryRun ? vi : (zhTranslations[vi] || vi)]);
	}

	const filesToModify = new Map();
	for (const occ of occurrences) {
		if (!filesToModify.has(occ.file)) filesToModify.set(occ.file, []);
		filesToModify.get(occ.file).push(occ);
	}

	console.log('=== i18n-extract ===');
	console.log(`Quét: ${files.length} file | Chuỗi tiếng Việt tìm thấy: ${occurrences.length} | Khóa mới: ${viEntries.length}`);
	console.log(`Chế độ: ${options.dryRun ? 'DRY-RUN (không ghi)' : options.noTranslate ? 'không dịch (en/zh = vi)' : 'dịch tự động'}`);

	for (const file of [...filesToModify.keys()].sort()) {
		const occs = filesToModify.get(file);
		console.log(`  ${path.relative(ROOT, file)} (${occs.length} chuỗi)`);
		if (options.dryRun) {
			for (const occ of occs) {
				console.log(`      ${JSON.stringify(occ.vi)}  ->  ${formatReplacement(occ, occ.key)}`);
			}
		}
	}

	if (reviews.length) {
		console.log('\nCảnh báo cần duyệt thủ công:');
		for (const r of reviews) console.log(`  [${path.relative(ROOT, r.file)}] ${r.msg}`);
	}

	if (options.dryRun) {
		console.log('\n(Không ghi file do --dry-run.)');
		return;
	}

	if (viEntries.length > 0) {
		if (options.backup) {
			for (const code of ['vi', 'en', 'zh']) {
				const p = LANG_FILES[code];
				fs.copyFileSync(p, p + '.bak');
			}
			console.log('Đã sao lưu 3 file messages.php (*.bak).');
		}

		appendToLang(LANG_FILES.vi, viEntries);
		appendToLang(LANG_FILES.en, enEntries);
		appendToLang(LANG_FILES.zh, zhEntries);
		console.log(`Đã thêm ${viEntries.length} khóa vào resources/lang/{vi,en,zh}/messages.php`);
	} else {
		console.log('Không có chuỗi mới để ghi vào các file ngôn ngữ.');
	}

	let refactored = 0;
	for (const [file, occs] of filesToModify) {
		const realSrc = fs.readFileSync(file, 'utf8');
		const sorted = [...occs].sort((a, b) => b.start - a.start);
		let out = realSrc;
		let changed = 0;
		for (const occ of sorted) {
			const found = locateInFile(out, occ.verifyOriginal, Math.max(0, occ.start - 2));
			if (found < 0) {
				console.warn(`  Bỏ qua (không định vị được): ${path.relative(ROOT, file)} @${occ.start}`);
				continue;
			}
			if (out.slice(found, found + occ.verifyOriginal.length) !== occ.verifyOriginal) {
				console.warn(`  Bỏ qua (nội dung đã đổi): ${path.relative(ROOT, file)} @${occ.start}`);
				continue;
			}
			out = out.slice(0, found) + formatReplacement(occ, occ.key) + out.slice(found + occ.verifyOriginal.length);
			changed++;
		}
		if (changed) {
			fs.writeFileSync(file, out, 'utf8');
			refactored++;
			console.log(`Đã refactor: ${path.relative(ROOT, file)} (${changed} chỗ)`);
		}
	}

	console.log('\nHoàn tất. Nhớ chạy: php artisan vue-i18n:generate');
}

main().catch((e) => {
	console.error('Lỗi:', e.stack || e.message);
	process.exit(1);
});
