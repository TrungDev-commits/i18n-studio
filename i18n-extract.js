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

  Quét .vue / .js / .blade.php / .php (Controllers, Services, Models), trích chuỗi tiếng Việt hardcode, tạo khóa
  snake_case, dịch vi->en/zh, ghi thêm vào 3 file resources/lang/*/messages.php
  rồi refactor nguồn sang $t('messages.key') hoặc __('messages.key').

  Hoặc quét API và bảng DB để phát hiện các trường tiếng Việt cần dịch dữ liệu động,
  tự động cập nhật config/translation.php và dịch DB sang EN/ZH:
    node scripts/i18n-extract.js --api-route=xxx --table=yyy

  <file|thư-mục...>   Một hoặc nhiều file / thư mục (quét đệ quy). Hỗ trợ cả file path hoặc file:// URL.

  Tùy chọn:
    --dry-run        Chỉ báo cáo, không ghi file, không gọi dịch.
    --no-translate   Không gọi Google dịch; en/zh dùng tạm giá trị tiếng Việt.
    --prefix=xxx     Tiền tố khóa (mặc định text_). Ví dụ --prefix=map_
    --backup         Sao lưu .bak cho 3 file messages.php trước khi ghi.
    --api-route=xxx  Đường dẫn API (ví dụ: api-ui/quan-ly-gioi-thieu-xa-phuong/detail)
    --table=xxx      Bảng database tương ứng (ví dụ: gioi_thieu_xa_phuong)

  Ví dụ:
    node scripts/i18n-extract.js app/Http/Controllers/TongQuanVanPhongDieuPhoiController.php
    node scripts/i18n-extract.js
    node scripts/i18n-extract.js src/views --dry-run --no-translate
    node scripts/i18n-extract.js resources/views/login.blade.php --prefix=text_
    node scripts/i18n-extract.js --api-route=api/vuon-kieu-mau-ntm/get-all --table=table_vuonmauntm
`);
	process.exit(1);
}

function parseArgs(argv) {
	const paths = [];
	for (const a of argv) {
		if (a === '--dry-run') options.dryRun = true;
		else if (a === '--no-translate') options.noTranslate = true;
		else if (a === '--backup') options.backup = true;
		else if (a === '--add-fallback' || a === '--fallback') options.addFallback = true;
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
	for (let input of inputs) {
		if (input.startsWith('file:///')) {
			input = decodeURIComponent(input.slice(8));
		} else if (input.startsWith('file://')) {
			input = decodeURIComponent(input.slice(7));
		}
		if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(input)) {
			input = input.slice(1);
		}
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
	if (ext !== '.vue' && ext !== '.js' && ext !== '.php') return false;
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
	const re = new RegExp(`(?:\\s|^)${escapeRegExp(name)}\\s*=\\s*["']${escapeRegExp(value)}["']`, 'g');
	return nearestMatch(findAllMatches(content, re), approx);
}

function calleeName(callee) {
	if (!callee) return '';
	if (callee.type === 'Identifier') return callee.name;
	if (callee.type === 'ThisExpression') return 'this';
	if (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') {
		const obj = calleeName(callee.object);
		const prop = callee.computed || !callee.property ? '' : callee.property.name;
		return obj ? `${obj}.${prop}` : prop;
	}
	return '';
}

function getRootIdentifierName(node) {
	let curr = node;
	while (curr && (curr.type === 'MemberExpression' || curr.type === 'OptionalMemberExpression')) {
		curr = curr.object;
	}
	return (curr && curr.type === 'Identifier') ? curr.name : '';
}

function isTranslationCall(node) {
	if (!node || typeof node !== 'object') return false;
	let callee = node;
	if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
		callee = node.callee;
	}
	if (!callee || typeof callee !== 'object') return false;
	const name = calleeName(callee);
	if (name) {
		if (['$t', 't', '$tc', '$te', 'trans', '__', 'i18n', 'this.$t', 'this.$tc', 'this.$te'].includes(name)) return true;
		if (/\b(\$t|t|\$tc|\$te|trans|__)$/.test(name)) return true;
		if (/\.t$/.test(name) || /\.\$t$/.test(name) || /\.\$tc$/.test(name) || /\.\$te$/.test(name) || /\.trans$/.test(name) || /\.__$/.test(name)) return true;
	}
	if (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') {
		const prop = callee.computed ? '' : (callee.property && callee.property.name);
		if (['$t', 't', '$tc', '$te', 'trans', '__'].includes(prop)) return true;
	}
	return false;
}

function hasTranslationCall(node) {
	if (!node || typeof node !== 'object') return false;
	if (isTranslationCall(node)) return true;

	for (const key of Object.keys(node)) {
		if (['start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments'].includes(key)) continue;
		const v = node[key];
		if (Array.isArray(v)) {
			for (const el of v) {
				if (hasTranslationCall(el)) return true;
			}
		} else if (v && typeof v === 'object') {
			if (hasTranslationCall(v)) return true;
		}
	}
	return false;
}

function hasTranslationKey(node) {
	if (!node || typeof node !== 'object') return false;

	if (node.type === 'StringLiteral') {
		const val = node.value;
		if (typeof val === 'string') {
			if (val.startsWith('messages.') || val.startsWith('trans.') || val.startsWith('lang.') || val.startsWith('validation.')) {
				return true;
			}
			if (/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/.test(val)) {
				return true;
			}
		}
	}

	if (node.type === 'Identifier') {
		if (/(?:trans|translation|i18n|msg|message)?key$/i.test(node.name)) return true;
	}

	if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
		const root = getRootIdentifierName(node);
		if (root === 'messages' || root === 'trans' || root === 'i18n') return true;
		const prop = node.computed ? '' : (node.property && node.property.name);
		if (/(?:^|_)(?:key|msg_key|trans_key|title_key)$/i.test(prop)) return true;
	}

	for (const key of Object.keys(node)) {
		if (['start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments'].includes(key)) continue;
		const v = node[key];
		if (Array.isArray(v)) {
			for (const el of v) {
				if (hasTranslationKey(el)) return true;
			}
		} else if (v && typeof v === 'object') {
			if (hasTranslationKey(v)) return true;
		}
	}

	return false;
}

function isApiResponseOrMessageNode(node) {
	if (!node || typeof node !== 'object') return false;

	if (node.type === 'TypeCastExpression' || node.type === 'TSAsExpression') {
		return isApiResponseOrMessageNode(node.expression);
	}

	if (node.type === 'LogicalExpression') {
		return isApiResponseOrMessageNode(node.left) || isApiResponseOrMessageNode(node.right);
	}

	if (node.type === 'Identifier') {
		return /^(?:res|response|err|error|errMsg|errorMessage|error_msg|msg|message|thongBao|thong_bao)$/i.test(node.name);
	}

	if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
		const propName = node.computed ? '' : (node.property && node.property.name);
		const isMsgProp = /^(?:message|messages|msg|msgs|error|errors|errMsg|errmsg|errorMessage|error_msg|title|desc|description|detail|details|thongbao|thong_bao|thong_bao_loi|statusText|status_text|success_msg|successMsg|success_message|reason|note|content)$/i.test(propName);

		const rootName = getRootIdentifierName(node);
		const isResponseRoot = /^(?:res|response|err|error|e|exception|data|result|results|payload|xhr|axios)$/i.test(rootName);

		if (isMsgProp) return true;
		if (isResponseRoot && (isMsgProp || propName === 'data' || propName === 'result' || propName === 'body')) return true;
	}

	if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
		const name = calleeName(node.callee);
		if (/(?:error|message|msg|thongbao|thong_bao)/i.test(name)) return true;
	}

	for (const key of Object.keys(node)) {
		if (['start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments'].includes(key)) continue;
		const v = node[key];
		if (Array.isArray(v)) {
			for (const el of v) {
				if (isApiResponseOrMessageNode(el)) return true;
			}
		} else if (v && typeof v === 'object') {
			if (isApiResponseOrMessageNode(v)) return true;
		}
	}

	return false;
}

function isFallbackCandidate(node) {
	if (!node || typeof node !== 'object') return false;
	return hasTranslationCall(node) || hasTranslationKey(node) || isApiResponseOrMessageNode(node);
}

function isNodeInside(target, parentNode) {
	if (!parentNode || typeof parentNode !== 'object') return false;
	if (target === parentNode) return true;
	return typeof target.start === 'number' && typeof parentNode.start === 'number' &&
		target.start >= parentNode.start && target.end <= parentNode.end;
}

function isComparison(node, parent, ancestors = []) {
	if (!node) return false;
	const chain = [parent, ...ancestors].filter(Boolean);

	if (parent && parent.type === 'BinaryExpression' && ['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(parent.operator)) {
		return true;
	}

	if (parent && parent.type === 'SwitchCase' && parent.test === node) {
		return true;
	}

	for (const ancestor of chain) {
		if (ancestor.type === 'BinaryExpression' && ['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(ancestor.operator)) {
			if (isNodeInside(node, ancestor.left) || isNodeInside(node, ancestor.right)) {
				return true;
			}
		}
	}

	return false;
}

function isFallbackForTranslation(node, parent, ancestors = []) {
	const chain = [parent, ...ancestors].filter(Boolean);

	for (let i = 0; i < chain.length; i++) {
		const current = chain[i];

		if (current.type === 'LogicalExpression' && ['||', '??', '&&'].includes(current.operator)) {
			if (isFallbackCandidate(current.left) && isNodeInside(node, current.right)) return true;
			if (isFallbackCandidate(current.right) && isNodeInside(node, current.left)) return true;
		}

		if (current.type === 'ConditionalExpression') {
			if (isFallbackCandidate(current.test) && (isNodeInside(node, current.consequent) || isNodeInside(node, current.alternate))) {
				return true;
			}
			if (isFallbackCandidate(current.consequent) && isNodeInside(node, current.alternate)) {
				return true;
			}
		}

		if (isTranslationCall(current)) {
			const firstArg = current.arguments && current.arguments[0];
			if (firstArg && !isNodeInside(node, firstArg)) {
				return true;
			}
		}
	}

	return false;
}

function isRunInsideTemplateFallback(text, relStart, runLength) {
	const mustacheRegex = /\{\{([\s\S]*?)\}\}/g;
	let match;
	while ((match = mustacheRegex.exec(text)) !== null) {
		const exprStart = match.index + 2;
		const exprEnd = match.index + match[0].length - 2;
		const runEnd = relStart + runLength;
		if (relStart < exprStart || runEnd > exprEnd) continue;

		try {
			const ast = babel.parseExpression(match[1], { allowReturnOutsideFunction: true });
			let isFallback = false;
			const walkExpr = (node, parent, ancestors = []) => {
				if (!node || typeof node !== 'object' || isFallback) return;
				if (Array.isArray(node)) {
					node.forEach((child) => walkExpr(child, parent, ancestors));
					return;
				}
				if (node.type === 'StringLiteral') {
					const literalStart = exprStart + node.start;
					const literalEnd = exprStart + node.end;
					if (relStart >= literalStart && runEnd <= literalEnd && (isComparison(node, parent, ancestors) || isFallbackForTranslation(node, parent, ancestors))) {
						isFallback = true;
						return;
					}
				}
				const nextAncestors = [node, ...ancestors];
				for (const key of Object.keys(node)) {
					if (['start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments'].includes(key)) continue;
					const value = node[key];
					if (value && typeof value === 'object') walkExpr(value, node, nextAncestors);
				}
			};
			walkExpr(ast, null, []);
			if (isFallback) return true;
		} catch (e) {
			if (/(\$t|i18n|trans|__|message|error|data|===|!==|==|!=)\b/.test(match[1]) && (/\|\||\?\?|\?|===|!==|==|!=/.test(match[1]))) return true;
		}
	}
	return false;
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
			const rawName = name.replace(/^(:|v-bind:)/, '');
			if (!TRANSLATABLE_ATTRS.has(rawName)) return;

			try {
				const exprAst = babel.parseExpression(value.trim());
				if (hasTranslationCall(exprAst) || hasTranslationKey(exprAst) || isApiResponseOrMessageNode(exprAst)) {
					return;
				}
			} catch (e) {}

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
		if ((n.type === 3 || n.type === 2) && typeof n.text === 'string' && !n.isComment) {
			const text = n.text;
			if (!VN_RX.test(text)) return;
			
			// Trim chuỗi để loại bỏ khoảng trắng và xuống dòng ở đầu/cuối
			const trimmedText = text.trim();
			if (!trimmedText) return;
			
			// Tạo regex tìm kiếm chuỗi đã trim
			const re = new RegExp(escapeRegExp(trimmedText), 'g');
			const match = nearestMatch(findAllMatches(content, re), n.start || 0);
			if (!match) {
				// Fallback: nếu không tìm thấy chuỗi đã trim (có thể do entities hoặc xuống dòng khác biệt),
				// chúng ta thử tìm kiếm trực tiếp xung quanh n.start
				findRuns(text, (run, relStart) => {
					if (isRunInsideTemplateFallback(text, relStart, run.length)) return;
					const runRe = new RegExp(escapeRegExp(run), 'g');
					const runMatch = nearestMatch(findAllMatches(content, runRe), (n.start || 0) + relStart);
					if (runMatch) {
						const abs = contentStart + runMatch.start;
						const absEnd = abs + run.length;
						if (parseSrc.slice(abs, absEnd) === run) {
							occurrences.push({ file, start: abs, end: absEnd, verifyOriginal: run, vi: run, kind: 'template-text' });
						}
					}
				});
				return;
			}
			
			const textStart = match.start;
			const offsetInTrimmed = text.indexOf(trimmedText);
			
			findRuns(text, (run, relStart) => {
				if (isRunInsideTemplateFallback(text, relStart, run.length)) return;
				const abs = contentStart + textStart + (relStart - offsetInTrimmed);
				const absEnd = abs + run.length;
				if (parseSrc.slice(abs, absEnd) !== run) return;
				occurrences.push({ file, start: abs, end: absEnd, verifyOriginal: run, vi: run, kind: 'template-text' });
			});
			return;
		}
		if (n.type === 1) {
			(n.attrsList || []).forEach(handleAttr);
			(n.children || []).forEach(walk);
			
			// Hỗ trợ đệ quy qua scopedSlots (các nội dung nằm trong slot như <template #general>)
			if (n.scopedSlots) {
				Object.keys(n.scopedSlots).forEach((key) => {
					walk(n.scopedSlots[key]);
				});
			}
		}
		(n.ifConditions || []).forEach((c) => c.block && c.block !== n && walk(c.block));
	};
	walk(compiled.ast);
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

	const walk = (node, parent, ancestors = []) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
		node.forEach((n) => walk(n, parent, ancestors));
			return;
		}
		if (node.type === 'StringLiteral') {
			if (isComparison(node, parent, ancestors)) return;
			if (isFallbackForTranslation(node, parent, ancestors)) return;
			handleLiteral(node, parent);
			return;
		}
		if (node.type === 'TemplateLiteral') {
			if (node.expressions && node.expressions.length === 0 && node.quasis && node.quasis.length === 1) {
				if (isComparison(node, parent, ancestors)) return;
				if (isFallbackForTranslation(node, parent, ancestors)) return;
				const val = node.quasis[0].value.cooked;
				handleLiteral(node, parent, val);
			}
			return;
		}
		const wasFn = isFunctionLike(node);
		if (wasFn) state.inFunction++;
		const nextParent = node;
		const nextAncestors = [node, ...ancestors];
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
			if (v && typeof v === 'object') walk(v, nextParent, nextAncestors);
		}
		if (wasFn) state.inFunction--;
	};
	walk(ast, null, []);
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

const PHP_MESSAGE_KEYS = new Set([
	'message',
	'messages',
	'content',
	'msg',
	'msgs',
	'title',
	'error',
	'errors',
	'warning',
	'warnings',
	'alert',
	'notice',
	'notify',
	'notification',
	'notifications',
	'thongbao',
	'thong_bao',
	'thong_bao_loi',
	'description',
	'desc',
	'reason',
	'detail',
	'details',
	'err_msg',
	'errmsg',
	'error_msg',
	'errormessage',
	'error_message',
	'success_msg',
	'successmsg',
	'success_message',
	'status_text',
	'statustext',
	'summary',
	'prompt',
	'note',
	'tooltip',
	'hint',
	'heading',
	'subheading',
	'help',
]);

const PHP_VALIDATION_KEY_RX = /^(?:[a-zA-Z0-9_*\[\]\.-]+\.)?(required|required_if|required_unless|required_with|required_with_all|required_without|required_without_all|min|max|numeric|integer|string|email|unique|regex|date|date_format|exists|mimes|between|confirmed|in|not_in|url|digits|digits_between|image|file|accepted|after|before|gt|gte|lt|lte|alpha|alpha_num|alpha_dash|dimensions|distinct|filled|nullable|size|present|timezone|uuid|json|boolean|ip|ipv4|ipv6|active_url|different|same|ends_with|starts_with)$/i;

const PHP_MESSAGE_VAR_RX = /^\$(?:message|messages|msg|msgs|content|error|errors|err|errs|errMsg|errorMessage|error_msg|warning|warnings|thongBao|thongbao|thong_bao|thong_bao_loi|notification|notifications|notice|alert|statusText|status_text|successMsg|success_msg|title|desc|description|note|summary|prompt|failure|failures|log|logs|res|result|results|listError|listErrors|errorList|errorsList)$/i;

const PHP_DATA_KEYS_EXCLUDE = new Set([
	'levelname',
	'level',
	'provincecode',
	'provincename',
	'districtcode',
	'districtname',
	'wardcode',
	'wardname',
	'provinceparent',
	'districtparent',
	'id',
	'code',
	'type',
	'status',
	'name',
	'ten',
	'tencoso',
	'diachi',
	'diachicu',
	'dia_danh',
	'dia_danh_lap_don',
	'table',
	'field',
	'column',
	'key',
	'slug',
	'icon',
	'url',
	'path',
	'toado',
	'polygon',
	'lat',
	'lng',
	'latitude',
	'longitude',
	'header',
	'headers',
	'pathtemplate',
	'exportname',
	'view',
	'layout',
	'model',
	'foreign_key',
	'primary_key',
	'order_by',
]);

function maskPhpComments(src) {
	let out = '';
	let i = 0;
	const len = src.length;
	while (i < len) {
		const c = src[i];
		// Chú thích một dòng // hoặc #
		if ((c === '/' && src[i + 1] === '/') || c === '#') {
			const startC = i;
			i += (c === '/' ? 2 : 1);
			while (i < len && src[i] !== '\n' && src[i] !== '\r') {
				i++;
			}
			out += ' '.repeat(i - startC);
			continue;
		}
		// Chú thích nhiều dòng /* ... */
		if (c === '/' && src[i + 1] === '*') {
			const startC = i;
			i += 2;
			while (i < len && !(src[i] === '*' && src[i + 1] === '/')) {
				i++;
			}
			i += (i < len ? 2 : 0);
			out += ' '.repeat(i - startC);
			continue;
		}
		// Chuỗi ký tự '...' hoặc "..."
		if (c === "'" || c === '"') {
			const quote = c;
			out += c;
			i++;
			let escaped = false;
			while (i < len) {
				const ch = src[i];
				out += ch;
				if (escaped) {
					escaped = false;
				} else if (ch === '\\') {
					escaped = true;
				} else if (ch === quote) {
					i++;
					break;
				}
				i++;
			}
			continue;
		}
		out += c;
		i++;
	}
	return out;
}

function getPhpTokensBefore(maskedSrc, fromIndex, maxTokens = 30) {
	const tokens = [];
	let i = fromIndex - 1;

	while (i >= 0 && tokens.length < maxTokens) {
		const c = maskedSrc[i];

		if (/\s/.test(c)) {
			i--;
			continue;
		}

		if (i > 0) {
			const two = maskedSrc.slice(i - 1, i + 1);
			if (['=>', '==', '!=', '<=', '>=', '.=', '+=', '-=', '->', '::', '??'].includes(two)) {
				tokens.push(two);
				i -= 2;
				continue;
			}
		}

		if ('=.,()[]{};?:<>!+-*/'.includes(c)) {
			tokens.push(c);
			i--;
			continue;
		}

		if (c === "'" || c === '"') {
			const q = c;
			const endQuote = i;
			i--;
			while (i >= 0) {
				if (maskedSrc[i] === q && maskedSrc[i - 1] !== '\\') {
					break;
				}
				i--;
			}
			const strLiteral = maskedSrc.slice(i, endQuote + 1);
			tokens.push(strLiteral);
			i--;
			continue;
		}

		if (/[a-zA-Z0-9_\x7f-\xff\$]/.test(c)) {
			const endWord = i;
			while (i >= 0 && /[a-zA-Z0-9_\x7f-\xff\$]/.test(maskedSrc[i])) {
				i--;
			}
			const word = maskedSrc.slice(i + 1, endWord + 1);
			tokens.push(word);
			continue;
		}

		i--;
	}

	return tokens;
}

function isPhpFallbackForTranslation(maskedSrc, startPos) {
	const tokens = getPhpTokensBefore(maskedSrc, startPos, 60);
	if (tokens[0] !== ':' || tokens[1] !== '?') return false;

	let parenDepth = 0;
	let tokenIndex = 2;
	for (; tokenIndex < tokens.length; tokenIndex++) {
		if (tokens[tokenIndex] === ')') parenDepth++;
		else if (tokens[tokenIndex] === '(') {
			parenDepth--;
			if (parenDepth === 0) {
				tokenIndex++;
				break;
			}
		}
	}

	return tokens[tokenIndex] === '__' || tokens[tokenIndex] === 'trans';
}

function isPhpMessageOrValidateContext(maskedSrc, startPos, value) {
	const vnMsgPattern = /(?:^Dòng[\s\d:]|Không tìm thấy|không tìm thấy|bắt buộc|khai báo|không hợp lệ|không được|đã tồn tại|thất bại|thành công|vượt quá|phải là|chưa được|không thể|không có quyền|vui lòng|loại|đối tượng)/i;
	if (value && vnMsgPattern.test(value)) {
		return true;
	}

	const tokens = getPhpTokensBefore(maskedSrc, startPos, 40);
	if (!tokens.length) return false;

	// Bỏ qua các chuỗi nối (.) hoặc toán tử ternary (?, :) cùng ngoặc nhóm ()
	let tIdx = 0;
	let depthParen = 0;
	let depthBracket = 0;

	while (tIdx < tokens.length) {
		const tok = tokens[tIdx];

		if (tok === ';' || tok === '{' || tok === '}') {
			break;
		}

		if (tok === ')') {
			depthParen++;
			tIdx++;
			continue;
		}
		if (tok === '(') {
			if (depthParen > 0) {
				depthParen--;
				tIdx++;
				continue;
			} else {
				// Nếu ngoặc '(' đứng ngay đầu (tIdx === 0), nghĩa là chuỗi là đối số trực tiếp của hàm
				if (tIdx === 0) {
					break;
				}
				// Nếu không, chỉ là ngoặc nhóm của sub-expression
				tIdx++;
				continue;
			}
		}

		if (tok === ']') {
			depthBracket++;
			tIdx++;
			continue;
		}
		if (tok === '[') {
			if (depthBracket > 0) {
				depthBracket--;
				tIdx++;
				continue;
			} else {
				break;
			}
		}

		if (depthParen > 0 || depthBracket > 0) {
			tIdx++;
			continue;
		}

		// Nếu gặp các toán tử gán, fat-arrow hoặc dấu phẩy phân tách đối số hàm thì dừng lại để phân tích
		if (tok === '=>' || tok === '=' || tok === '.=' || tok === ',') {
			break;
		}

		// Các ký tự khác như . ? : hoặc biến, hằng, chuỗi con -> tiếp tục quét lùi
		tIdx++;
	}

	const rootTokens = tokens.slice(tIdx);
	if (!rootTokens.length) return false;

	// 2. Gán mảng Key => Value
	if (rootTokens[0] === '=>') {
		const keyToken = rootTokens[1];
		if (keyToken) {
			const cleanKey = keyToken.replace(/^['"]|['"]$/g, '');
			const cleanKeyLower = cleanKey.toLowerCase();

			if (PHP_DATA_KEYS_EXCLUDE.has(cleanKeyLower)) {
				return false;
			}

			if (PHP_MESSAGE_KEYS.has(cleanKeyLower)) {
				return true;
			}

			if (PHP_VALIDATION_KEY_RX.test(cleanKey)) {
				return true;
			}
		}

		// Kiểm tra xem mảng có thuộc khai báo $messages không
		for (let k = 1; k < Math.min(rootTokens.length, 25); k++) {
			const tok = rootTokens[k];
			if (['messages', '$messages', '$customMessages', '$validationMessages', '$errors', '$error', '$err', '$errs'].includes(tok)) {
				return true;
			}
			if (tok === ';' || tok === '{') break;
		}

		return false;
	}

	// 3. Gán biến ($message =, $msg =, $content =, $errors[] =...)
	if (rootTokens[0] === '=' || rootTokens[0] === '.=') {
		let varToken = rootTokens[1];
		if (varToken === ']') {
			let bIdx = 2;
			while (bIdx < rootTokens.length && rootTokens[bIdx] !== '[') bIdx++;
			if (bIdx + 1 < rootTokens.length) {
				varToken = rootTokens[bIdx + 1];
			}
		}
		if (varToken && PHP_MESSAGE_VAR_RX.test(varToken)) {
			return true;
		}
		return false;
	}

	// 4. Tham số hàm / method gọi (CommonUtil::errorresponse, throw new Exception, ->with, abort...)
	let parenIdx = -1;
	for (let k = 0; k < Math.min(rootTokens.length, 10); k++) {
		if (rootTokens[k] === '(') {
			parenIdx = k;
			break;
		}
		if (rootTokens[k] === ';' || rootTokens[k] === '}' || rootTokens[k] === '{' || rootTokens[k] === '=>') {
			break;
		}
	}

	if (parenIdx !== -1) {
		const fnTokens = rootTokens.slice(parenIdx + 1);
		if (fnTokens.length > 0) {
			const callSignature = fnTokens.slice(0, 4).reverse().join('');

			if (
				callSignature.includes('CommonUtil::errorresponse') ||
				callSignature.includes('CommonUtil::errorResponse') ||
				callSignature.includes('CommonUtil::successResponse') ||
				callSignature.includes('CommonUtil::successresponse') ||
				callSignature.includes('CommonUtil::response')
			) {
				return true;
			}

			if (callSignature.includes('thrownew') || callSignature.includes('Exception') || callSignature.includes('Error')) {
				return true;
			}

			if (fnTokens[0] === 'abort' || fnTokens[0] === 'abort_if' || fnTokens[0] === 'abort_unless') {
				return true;
			}

			if (fnTokens[0] === 'with' && fnTokens[1] === '->') {
				if (parenIdx > 0 && rootTokens[parenIdx - 1] === ',') {
					const firstArg = rootTokens[parenIdx - 2];
					if (firstArg && /['"](error|success|message|warning|info|status)['"]/i.test(firstArg)) {
						return true;
					}
				}
				return true;
			}

			if (
				fnTokens[0] === 'withErrors' ||
				fnTokens[0] === 'withSuccess' ||
				fnTokens[0] === 'flash'
			) {
				return true;
			}

			if (
				(fnTokens[0] === 'error' || fnTokens[0] === 'info' || fnTokens[0] === 'warn' || fnTokens[0] === 'warning' || fnTokens[0] === 'line' || fnTokens[0] === 'comment') &&
				fnTokens[1] === '->'
			) {
				return true;
			}

			if (fnTokens[0] === 'add' && fnTokens[1] === '->') {
				return true;
			}
		}
	}

	return false;
}

function extractPhp(fileSrc, file, occurrences, reviews) {
	const maskedSrc = maskPhpComments(fileSrc);
	let i = 0;
	const len = fileSrc.length;
	let phpScopeLevel = 0;

	while (i < len) {
		const c = fileSrc[i];

		// Bỏ qua chú thích một dòng // hoặc #
		if ((c === '/' && fileSrc[i + 1] === '/') || c === '#') {
			i += (c === '/' ? 2 : 1);
			while (i < len && fileSrc[i] !== '\n' && fileSrc[i] !== '\r') {
				i++;
			}
			continue;
		}

		// Bỏ qua chú thích nhiều dòng /* ... */
		if (c === '/' && fileSrc[i + 1] === '*') {
			i += 2;
			while (i < len && !(fileSrc[i] === '*' && fileSrc[i + 1] === '/')) {
				i++;
			}
			i += 2;
			continue;
		}

		// Quét chuỗi ký tự (nháy đơn ' hoặc nháy kép ")
		if (c === "'" || c === '"') {
			const quote = c;
			const start = i;
			i++; // Bỏ qua dấu nháy mở
			let value = '';
			let escaped = false;
			let isComplexInterpolated = false;
			let braceDepth = 0;

			while (i < len) {
				const ch = fileSrc[i];
				if (escaped) {
					if (quote === "'") {
						if (ch === "'" || ch === '\\') value += ch;
						else value += '\\' + ch;
					} else {
						if (ch === 'n') value += '\n';
						else if (ch === 'r') value += '\r';
						else if (ch === 't') value += '\t';
						else if (ch === '"' || ch === '\\' || ch === '$') value += ch;
						else value += '\\' + ch;
					}
					escaped = false;
					i++;
					continue;
				}

				if (ch === '\\') {
					escaped = true;
					i++;
					continue;
				}

				if (quote === '"') {
					if (ch === '$') {
						isComplexInterpolated = true;
						value += ch;
						i++;
						continue;
					}

					if (ch === '{' && i > 0 && fileSrc[i - 1] === '$') {
						braceDepth++;
						value += ch;
						i++;
						continue;
					}

					if (braceDepth > 0) {
						if (ch === '}') {
							braceDepth--;
							value += ch;
							i++;
							continue;
						}

						if (ch === '"' || ch === "'") {
							const innerQuote = ch;
							value += ch;
							i++;
							let innerEscaped = false;
							while (i < len) {
								const innerCh = fileSrc[i];
								value += innerCh;
								if (innerEscaped) {
									innerEscaped = false;
								} else if (innerCh === '\\') {
									innerEscaped = true;
								} else if (innerCh === innerQuote) {
									i++;
									break;
								}
								i++;
							}
							continue;
						}
					}

					if (ch === '"' && braceDepth === 0) {
						break;
					}
				} else {
					if (ch === "'") {
						break;
					}
				}

				value += ch;
				i++;
			}

			if (i < len) i++; // Bỏ qua dấu nháy đóng
			const end = i;
			const raw = fileSrc.slice(start, end);

			if (isPhpFallbackForTranslation(maskedSrc, start)) continue;

			// Kiểm tra nếu nằm ngoài function (ở class properties scope: phpScopeLevel <= 1)
			// thì đẩy vào reviews và không refactor tự động để tránh Constant expression contains invalid operations
			if (VN_RX.test(value) && phpScopeLevel <= 1) {
				reviews.push({ file, msg: `Chuỗi PHP ở thuộc tính lớp (class property) — duyệt thủ công và chuyển vào constructor: ${JSON.stringify(raw)}` });
				continue;
			}

			if (isComplexInterpolated) {
				if (VN_RX.test(value) && isPhpMessageOrValidateContext(maskedSrc, start, value)) {
					const varRegex = /{\$([a-zA-Z0-9_]+)(?:\[['"]?([a-zA-Z0-9_]+)['"]?\]|->([a-zA-Z0-9_]+))?\}|\$([a-zA-Z0-9_]+)(?:\[['"]?([a-zA-Z0-9_]+)['"]?\]|->([a-zA-Z0-9_]+))?/g;
					let match;
					const varObjs = [];
					const seenNames = new Set();
					let finalVi = value;

					while ((match = varRegex.exec(raw))) {
						const fullMatch = match[0];
						const baseVar = match[1] || match[4];
						const arrayKey = match[2] || match[5];
						const propKey = match[3] || match[6];

						if (!baseVar) continue;

						let expr = `$${baseVar}`;
						let placeholderName = baseVar;

						if (arrayKey) {
							expr = `$${baseVar}['${arrayKey}']`;
							placeholderName = (baseVar === 'check' || baseVar === 'data' || baseVar === 'provinceCheck' || baseVar === 'checkWP') ? baseVar : `${baseVar}_${arrayKey}`;
						} else if (propKey) {
							expr = `$${baseVar}->${propKey}`;
							placeholderName = propKey;
						}

						let name = placeholderName;
						let count = 2;
						while (seenNames.has(name)) {
							name = `${placeholderName}_${count}`;
							count++;
						}
						seenNames.add(name);

						varObjs.push({ name, expr });
						finalVi = finalVi.split(fullMatch).join(':' + name);
					}

					if (varObjs.length > 0) {
						occurrences.push({
							file,
							start,
							end,
							verifyOriginal: raw,
							vi: finalVi,
							kind: 'php-interpolated',
							interpolatedVarObjs: varObjs,
							interpolatedVars: varObjs.map(v => v.name)
						});
					} else {
						reviews.push({ file, msg: `Chuỗi PHP double-quote có biến nội suy ($var) — duyệt thủ công: ${JSON.stringify(raw)}` });
					}
				}
				continue;
			}

			if (value.length < 2 || !VN_RX.test(value)) continue;

			// Kiểm tra nếu đã được bọc bởi hàm dịch: __() hoặc trans() hoặc @lang()
			let beforeIdx = start - 1;
			while (beforeIdx >= 0 && /\s/.test(fileSrc[beforeIdx])) {
				beforeIdx--;
			}
			if (beforeIdx >= 0 && fileSrc[beforeIdx] === '(') {
				let fnIdx = beforeIdx - 1;
				while (fnIdx >= 0 && /\s/.test(fileSrc[fnIdx])) {
					fnIdx--;
				}
				const fnEnd = fnIdx + 1;
				while (fnIdx >= 0 && /[a-zA-Z0-9_]/.test(fileSrc[fnIdx])) {
					fnIdx--;
				}
				const fnName = fileSrc.slice(fnIdx + 1, fnEnd);
				if (fnName === '__' || fnName === 'trans' || fnName === '@lang') {
					continue; // Đã được dịch
				}
			}

			if (value.startsWith('messages.')) continue;

			// Chỉ chấp nhận các chuỗi nằm trong ngữ cảnh message, content, validation hoặc thông báo
			if (!isPhpMessageOrValidateContext(maskedSrc, start, value)) {
				continue;
			}

			if (/\{[\sA-Za-z0-9_]+\}/.test(value)) {
				reviews.push({ file, msg: `Chuỗi có tham số {param} — duyệt thủ công: ${JSON.stringify(value)}` });
				continue;
			}

			occurrences.push({
				file,
				start,
				end,
				verifyOriginal: raw,
				vi: value,
				kind: 'php-code',
			});

			continue;
		}

		if (c === '{') {
			phpScopeLevel++;
		} else if (c === '}') {
			phpScopeLevel--;
		}

		i++;
	}
}

/**
 * Kiểm tra xem property có phải là mảng i18n/validation message không.
 * Chỉ migrate nếu:
 *   1. Tên property nằm trong danh sách i18n đã biết ($messages, $labels...), HOẶC
 *   2. Mảng có ít nhất một KEY dạng 'field.rule' (cú pháp Laravel validation), HOẶC
 *   3. Mảng là flat string-to-string map và tất cả value là sentence (không phải column name/code)
 * Không migrate các mảng dữ liệu/cấu hình như $EXCEL_COLUMNS, $LOAI_HINH_MAP...
 */
function isI18nArrayProperty(propName, valExpr) {
	// Heuristic 1: tên property khớp với pattern i18n thông dụng
	const knownI18nNames = /^(messages|customMessages|validationMessages|errorMessages|labels|attributes|customAttributes|niceNames)$/i;
	if (knownI18nNames.test(propName)) return true;

	// Heuristic 2: mảng có ít nhất một key dạng 'field.rule' (Laravel validation message key)
	// Ví dụ: 'tencoso.required', 'email.max', 'phone.regex'
	if (/['"][a-zA-Z0-9_]+\.[a-zA-Z0-9_]+['"]\s*=>/.test(valExpr)) return true;

	// Heuristic 3: mảng messages.xxx key pattern (prefix key của i18n)
	if (/['"]messages\.[a-zA-Z0-9_]+['"]/.test(valExpr)) return true;

	// Không phải i18n array → bỏ qua
	return false;
}

function migrateClassPropertiesToConstructor(fileSrc) {
	// Dùng regex line-by-line an toàn: chỉ quét các khai báo thuộc tính lớp nằm ở đầu dòng,
	// có đúng cú pháp (modifier + $name = [...]; ) trong nội dung lớp, trước method đầu tiên.

	// --- Bước 1: Xác định vùng body lớp (từ { đầu tiên sau khai báo class đến hết file) ---
	// Chỉ xử lý phần TRƯỚC method/function đầu tiên (tức là class property declarations)
	const classBodyMatch = /class\s+\w+(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{/.exec(fileSrc);
	if (!classBodyMatch) return fileSrc;

	const classBodyStart = classBodyMatch.index + classBodyMatch[0].length;

	// Tìm vị trí khai báo method đầu tiên trong class body
	const firstMethodMatch = /^\s+((?:abstract|final|static|public|protected|private)\s+)*function\s+\w+\s*\(/m.exec(fileSrc.slice(classBodyStart));
	const scanEnd = firstMethodMatch
		? classBodyStart + firstMethodMatch.index
		: fileSrc.length;

	const propertySection = fileSrc.slice(classBodyStart, scanEnd);

	// --- Bước 2: Tìm tất cả property declarations có chứa tiếng Việt ---
	// Regex bắt toàn bộ: modifier $name = [nội dung multi-line]; tới dấu ; kết thúc
	// Dùng cách duyệt line-by-line kết hợp bracket counting
	const propertiesToMigrate = [];

	let si = 0;
	const slen = propertySection.length;

	while (si < slen) {
		// Bỏ qua comment dòng
		if ((propertySection[si] === '/' && propertySection[si + 1] === '/') || propertySection[si] === '#') {
			while (si < slen && propertySection[si] !== '\n') si++;
			continue;
		}
		// Bỏ qua comment block
		if (propertySection[si] === '/' && propertySection[si + 1] === '*') {
			si += 2;
			while (si < slen && !(propertySection[si] === '*' && propertySection[si + 1] === '/')) si++;
			si += 2;
			continue;
		}

		const remaining = propertySection.slice(si);
		// Match khai báo property (có thể có whitespace dẫn đầu): phải có modifier, KHÔNG có static
		// (static property không thể dùng $this-> trong constructor)
		const propMatch = /^(\s*)(private|protected|public)\s+(?!static\s)\$([a-zA-Z0-9_]+)\s*=\s*/.exec(remaining);
		if (propMatch) {
			const fullMatchText = propMatch[0];
			const leadingWhitespace = propMatch[1];
			const modifier = propMatch[2];
			const propName = propMatch[3];
			// declStart bắt đầu từ modifier, bỏ qua whitespace dẫn đầu
			const declStart = classBodyStart + si + leadingWhitespace.length;

			let vi = si + fullMatchText.length;
			const valStart = vi;
			let bracketCount = 0;
			let valEnd = -1;

			while (vi < slen) {
				const ch = propertySection[vi];
				// skip inline comment
				if ((ch === '/' && propertySection[vi + 1] === '/') || ch === '#') {
					while (vi < slen && propertySection[vi] !== '\n') vi++;
					continue;
				}
				// skip block comment
				if (ch === '/' && propertySection[vi + 1] === '*') {
					vi += 2;
					while (vi < slen && !(propertySection[vi] === '*' && propertySection[vi + 1] === '/')) vi++;
					vi += 2;
					continue;
				}
				// skip string
				if (ch === "'" || ch === '"') {
					const q = ch;
					vi++;
					let esc = false;
					while (vi < slen) {
						const c2 = propertySection[vi];
						if (esc) { esc = false; }
						else if (c2 === '\\') { esc = true; }
						else if (c2 === q) { break; }
						vi++;
					}
					if (vi < slen) vi++;
					continue;
				}

				if (ch === '[' || ch === '(') bracketCount++;
				else if (ch === ']' || ch === ')') bracketCount--;
				else if (ch === ';' && bracketCount === 0) {
					valEnd = vi;
					break;
				}
				vi++;
			}

			if (valEnd !== -1) {
				const valExpr = propertySection.slice(valStart, valEnd).trim();
				// declEnd = absolute offset trong fileSrc của ký tự ngay sau dấu ;
				const declEnd = classBodyStart + valEnd + 1;

				if (VN_RX.test(valExpr) && isI18nArrayProperty(propName, valExpr)) {
					const isArray = valExpr.startsWith('[') || valExpr.startsWith('array(');
					propertiesToMigrate.push({ modifier, name: propName, value: valExpr, start: declStart, end: declEnd, isArray });
				}
			}

			// Tiếp tục quét từ sau dấu ; (hoặc cuối nếu không tìm thấy)
			// Dùng = (gán) không phải += (cộng thêm) để tránh nhảy quá vị trí
			si = (valEnd !== -1 ? (valEnd + 1) : (si + fullMatchText.length));
			continue;
		}

		si++;
	}

	if (propertiesToMigrate.length === 0) return fileSrc;

	// --- Bước 3: Thay thế các property bằng khai báo rỗng (từ cuối file lên đầu để offset không lệch) ---
	propertiesToMigrate.sort((a, b) => b.start - a.start);
	const propsInOrder = [...propertiesToMigrate].reverse();

	let newSrc = fileSrc;
	for (const prop of propertiesToMigrate) {
		const emptyDecl = prop.isArray ? `${prop.modifier} $${prop.name} = [];` : `${prop.modifier} $${prop.name};`;
		newSrc = newSrc.slice(0, prop.start) + emptyDecl + newSrc.slice(prop.end);
	}

	// --- Bước 4: Tạo assignment block để chèn vào constructor ---
	const assignmentBlocks = propsInOrder.map(prop => {
		const indent = '        ';
		const innerIndent = '            ';
		const lines = prop.value.split('\n');
		const indentedValue = lines.map((line, idx) => idx === 0 ? line.trimEnd() : innerIndent + line.trim()).join('\n');
		return `${indent}$this->${prop.name} = ${indentedValue};`;
	});
	const assignmentBlockStr = assignmentBlocks.join('\n');

	// --- Bước 5: Chèn vào constructor (hoặc tạo mới nếu chưa có) ---
	const constructRegex = /\bfunction\s+__construct\s*\([^)]*\)\s*\{/;
	const constructMatch = constructRegex.exec(newSrc);

	if (constructMatch) {
		const insertIdx = constructMatch.index + constructMatch[0].length;
		newSrc = newSrc.slice(0, insertIdx) + '\n' + assignmentBlockStr + '\n' + newSrc.slice(insertIdx);
	} else {
		// Sinh constructor mới, chèn sau khai báo property đầu tiên
		const firstProp = propsInOrder[0];
		const firstPropEmptyDecl = firstProp.isArray
			? `${firstProp.modifier} $${firstProp.name} = [];`
			: `${firstProp.modifier} $${firstProp.name};`;
		const declIdx = newSrc.indexOf(firstPropEmptyDecl);
		const newConstructor = `\n\n    /**\n     * Create a new controller instance.\n     * @param \\Illuminate\\Http\\Request $request\n     * @return void\n     */\n    public function __construct(\\Illuminate\\Http\\Request $request)\n    {\n${assignmentBlockStr}\n    }`;

		const insertIdx = declIdx !== -1 ? declIdx + firstPropEmptyDecl.length : newSrc.indexOf('{') + 1;
		newSrc = newSrc.slice(0, insertIdx) + newConstructor + newSrc.slice(insertIdx);
	}

	return newSrc;
}

function extractFile(file, occurrences, reviews) {
	let fileSrc = fs.readFileSync(file, 'utf8');
	if (file.endsWith('.blade.php')) {
		extractBlade(fileSrc, file, occurrences, reviews);
		return;
	}
	const ext = path.extname(file).toLowerCase();
	if (ext === '.php') {
		// Tiền xử lý tự động di chuyển các class properties chứa tiếng Việt vào constructor
		const migratedSrc = migrateClassPropertiesToConstructor(fileSrc);
		if (migratedSrc !== fileSrc) {
			if (!options.dryRun) {
				fs.writeFileSync(file, migratedSrc, 'utf8');
			}
			fileSrc = migratedSrc;
		}
		extractPhp(fileSrc, file, occurrences, reviews);
	} else if (ext === '.vue') {
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

function cleanForMatching(str) {
	if (str == null) return '';
	return String(str)
		.trim()
		.replace(/[\.\?!:]+$/, '') // Loại bỏ dấu chấm, chấm hỏi, chấm than, hai chấm ở cuối
		.trim()
		.replace(/\s+/g, ' ');     // Chuẩn hóa khoảng trắng
}

function readLang(filePath) {
	let keyValueMap = {};
	try {
		// Dùng PHP CLI để load file array PHP và convert sang JSON (chuẩn xác 100%, tránh lỗi Regex)
		const { execSync } = require('child_process');
		const escapedPath = filePath.replace(/\\/g, '\\\\');
		const json = execSync(`php -r "echo json_encode(include '${escapedPath}');"`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
		keyValueMap = JSON.parse(json);
	} catch (err) {
		// Fallback về regex cũ nếu PHP có lỗi
		const src = fs.readFileSync(filePath, 'utf8');
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
			keyValueMap[key] = val;
		}
	}

	const keys = new Set(Object.keys(keyValueMap));
	const valueKeyMap = {};
	
	// Lưu các biến thể của chuỗi dịch để tìm kiếm thông minh hơn
	for (const key of keys) {
		const val = keyValueMap[key];
		if (val !== undefined && val !== null) {
			const strVal = String(val);
			const trimmed = strVal.trim();
			const normalized = trimmed.replace(/\s+/g, ' ');
			const cleaned = cleanForMatching(strVal);

			if (!valueKeyMap[strVal]) valueKeyMap[strVal] = key;
			if (!valueKeyMap[trimmed]) valueKeyMap[trimmed] = key;
			if (!valueKeyMap[normalized]) valueKeyMap[normalized] = key;
			if (cleaned && !valueKeyMap[cleaned]) valueKeyMap[cleaned] = key;
		}
	}
	
	const src = fs.readFileSync(filePath, 'utf8');
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
		case 'php-code':
			return `__('${full}')`;
		case 'php-interpolated':
			if (occ.interpolatedVarObjs && occ.interpolatedVarObjs.length > 0) {
				const arrayItems = occ.interpolatedVarObjs.map(v => `'${v.name}' => ${v.expr}`).join(', ');
				return `__('${full}', [${arrayItems}])`;
			}
			const arrayItems = (occ.interpolatedVars || []).map(v => `'${v}' => $${v}`).join(', ');
			return `__('${full}', [${arrayItems}])`;
		default:
			throw new Error(`Loại chưa biết: ${occ.kind}`);
	}
}

async function translateViaGoogle(texts, targetLang) {
	const target = targetLang === 'zh' ? 'zh-CN' : targetLang;
	const out = {};
	const timeoutMs = 5000;

	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	async function fetchOne(text) {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), timeoutMs);
		const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=vi&tl=${target}&q=${encodeURIComponent(text)}`;
		try {
			const res = await fetch(url, {
				signal: ctrl.signal,
				headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			if (Array.isArray(json)) {
				return typeof json[0] === 'string' ? json[0] : (json[0] && json[0][0]) || text;
			}
			return text;
		} finally {
			clearTimeout(timer);
		}
	}

	console.log(`[Dịch] Bắt đầu dịch ${texts.length} chuỗi sang [${targetLang.toUpperCase()}]...`);

	for (let i = 0; i < texts.length; i++) {
		const t = texts[i];
		console.log(`   -> [${targetLang.toUpperCase()}] (${i + 1}/${texts.length}): "${t}"`);
		try {
			await sleep(100);
			const translated = await fetchOne(t);
			out[t] = (translated && translated.trim()) || t;
		} catch (e) {
			console.warn(`   ⚠️ Lỗi khi dịch "${t}": ${e.message}`);
			out[t] = t;
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
	if (options.addFallback) {
		const { scanFile, applyFallbacks } = require('./server/services/fallbackInjector');
		console.log('=== i18n-extract --add-fallback ===');
		console.log('Đang quét các vị trí sử dụng song ngữ ($t, __, trans) chưa có Fallback...');
		
		const viLang = readLang(LANG_FILES.vi);
		const files = collectFiles(inputs);
		const occurrences = [];
		for (const f of files) {
			scanFile(f, viLang.keyValueMap, occurrences);
		}

		console.log(`Tìm thấy ${occurrences.length} vị trí thiếu fallback trong ${new Set(occurrences.map(o => o.file)).size} file.`);
		if (occurrences.length === 0) {
			console.log('Tất cả các vị trí đã có Fallback đầy đủ!');
			return;
		}

		for (const occ of occurrences) {
			console.log(`  [${path.relative(ROOT, occ.file)}] ${occ.raw} -> ${occ.replacement}`);
		}

		if (options.dryRun) {
			console.log('\n(Chế độ --dry-run: không ghi đè file.)');
			return;
		}

		const result = applyFallbacks(occurrences);
		console.log(`\n🎉 Đã thêm Fallback thành công cho ${result.appliedOccurrencesCount} vị trí trong ${result.modifiedFilesCount} file!`);
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
		const trimmedVi = vi.trim();
		const normalizedVi = trimmedVi.replace(/\s+/g, ' ');
		const cleanedVi = cleanForMatching(vi);
		
		let matchedKey = null;
		if (lang.vi.valueKeyMap) {
			matchedKey = lang.vi.valueKeyMap[vi] 
				|| lang.vi.valueKeyMap[trimmedVi] 
				|| lang.vi.valueKeyMap[normalizedVi]
				|| lang.vi.valueKeyMap[cleanedVi];
		}

		if (matchedKey) {
			keyByVi[vi] = matchedKey;
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
