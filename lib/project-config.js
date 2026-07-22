'use strict';

/**
 * Project Config — auto-detected, human-editable project configuration.
 *
 * .lex/config.json is the single source of truth for project metadata.
 * - Auto-detected by AI during `lex init` or `lex config --detect`
 * - Editable by humans at any time
 * - Read by all lex commands instead of guessing
 *
 * Schema:
 * {
 *   "version": 1,
 *   "language": "php",
 *   "framework": "laravel",
 *   "database": { "type": "mysql", "host": "127.0.0.1", ... , "detected_from": ".env" },
 *   "commands": { "test": "php artisan test", "serve": "php artisan serve", ... },
 *   "paths": { "migrations": "database/migrations", "routes": "routes/web.php", ... },
 *   "skip_dirs": ["vendor/", "node_modules/", "storage/"],
 *   "schema_formats": [".php", ".sql"],
 *   "detected_at": "2026-07-22T12:00:00Z",
 *   "detected_by": "lex-auto"
 * }
 */

const fs = require('node:fs');
const path = require('node:path');

function configPath(root) {
  return path.join(root, '.lex', 'config.json');
}

function loadConfig(root) {
  const p = configPath(root);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function saveConfig(root, config) {
  const p = configPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return p;
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function readEnv(root) {
  const envPath = path.join(root, '.env');
  const env = {};
  const text = readText(envPath);
  if (!text) return env;
  for (const line of text.split('\n')) {
    const m = line.replace(/\r$/, '').match(/^([A-Z_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function detectLanguageAndFramework(dir) {
  const composer = readJson(path.join(dir, 'composer.json'));
  if (composer) {
    const req = { ...(composer.require || {}), ...(composer['require-dev'] || {}) };
    if (req['laravel/framework']) return { language: 'php', framework: 'laravel', version: req['laravel/framework'] };
    if (req['symfony/framework-bundle']) return { language: 'php', framework: 'symfony' };
    if (req['codeigniter/codeigniter']) return { language: 'php', framework: 'codeigniter' };
    if (req['yiisoft/yii2']) return { language: 'php', framework: 'yii2' };
    return { language: 'php', framework: '' };
  }
  const cargo = readText(path.join(dir, 'Cargo.toml'));
  if (cargo) {
    const m = cargo.match(/^name\s*=\s*"([^"]+)"/m);
    return { language: 'rust', framework: '', package: m ? m[1] : '' };
  }
  const pyproject = readText(path.join(dir, 'pyproject.toml'));
  if (pyproject) {
    if (/fastapi/i.test(pyproject)) return { language: 'python', framework: 'fastapi' };
    if (/django/i.test(pyproject)) return { language: 'python', framework: 'django' };
    if (/flask/i.test(pyproject)) return { language: 'python', framework: 'flask' };
    return { language: 'python', framework: '' };
  }
  const reqText = readText(path.join(dir, 'requirements.txt'));
  if (reqText) {
    if (/django/i.test(reqText)) return { language: 'python', framework: 'django' };
    if (/fastapi/i.test(reqText)) return { language: 'python', framework: 'fastapi' };
    if (/flask/i.test(reqText)) return { language: 'python', framework: 'flask' };
    return { language: 'python', framework: '' };
  }
  const goMod = readText(path.join(dir, 'go.mod'));
  if (goMod) {
    const m = goMod.match(/^module\s+(\S+)/m);
    return { language: 'go', framework: '', module: m ? m[1] : '' };
  }
  const gemfile = readText(path.join(dir, 'Gemfile'));
  if (gemfile) {
    if (/rails/i.test(gemfile)) return { language: 'ruby', framework: 'rails' };
    if (/sinatra/i.test(gemfile)) return { language: 'ruby', framework: 'sinatra' };
    return { language: 'ruby', framework: '' };
  }
  const pkg = readJson(path.join(dir, 'package.json'));
  if (pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps['next']) return { language: 'typescript', framework: 'nextjs' };
    if (deps['@angular/core']) return { language: 'typescript', framework: 'angular' };
    if (deps['@sveltejs/kit']) return { language: 'typescript', framework: 'sveltekit' };
    if (deps['vue']) return { language: 'typescript', framework: 'vue' };
    if (deps['svelte']) return { language: 'typescript', framework: 'svelte' };
    if (deps['react']) return { language: 'typescript', framework: 'react' };
    if (deps['express']) return { language: 'typescript', framework: 'express' };
    if (deps['fastify']) return { language: 'typescript', framework: 'fastify' };
    if (deps['@remix-run/dev']) return { language: 'typescript', framework: 'remix' };
    if (deps['nuxt']) return { language: 'typescript', framework: 'nuxt' };
    return { language: 'typescript', framework: '' };
  }
  return { language: '', framework: '' };
}

function detectDatabase(root, lang, framework) {
  const env = readEnv(root);

  if (env.DB_CONNECTION || env.DB_DRIVER) {
    const conn = env.DB_CONNECTION || env.DB_DRIVER;
    const db = {
      type: conn === 'pgsql' || conn === 'postgres' || conn === 'postgresql' ? 'postgres' : conn,
      host: env.DB_HOST || '127.0.0.1',
      port: env.DB_PORT || (conn === 'mysql' || conn === 'mariadb' ? '3306' : conn === 'pgsql' || conn === 'postgres' ? '5432' : ''),
      name: env.DB_DATABASE || '',
      user: env.DB_USERNAME || env.DB_USER || '',
      detected_from: '.env',
    };
    if (db.type === 'sqlite' || db.type === 'sqlite3') {
      let dbPath = env.DB_DATABASE || '';
      if (dbPath && !path.isAbsolute(dbPath)) dbPath = path.join(root, dbPath);
      db.path = dbPath;
    }
    return db;
  }

  if (env.DATABASE_URL) {
    const m = env.DATABASE_URL.match(/^(postgres|mysql|sqlite|mongodb):\/\/([^:]+):([^@]*)@([^:]+):(\d+)\/(.+)/);
    if (m) {
      return {
        type: m[1] === 'postgres' ? 'postgres' : m[1],
        host: m[4],
        port: m[5],
        name: m[6],
        user: decodeURIComponent(m[2]),
        detected_from: '.env DATABASE_URL',
      };
    }
  }

  if (framework === 'laravel') {
    return { type: 'mysql', host: '127.0.0.1', port: '3306', name: '', user: 'root', detected_from: 'laravel-default' };
  }
  if (framework === 'django' || framework === 'fastapi') {
    return { type: 'postgres', host: '127.0.0.1', port: '5432', name: '', user: 'postgres', detected_from: 'python-default' };
  }
  if (framework === 'rails') {
    return { type: 'sqlite', path: path.join(root, 'db', 'development.sqlite3'), detected_from: 'rails-default' };
  }

  if (fs.existsSync(path.join(root, 'prisma', 'schema.prisma'))) {
    const schema = readText(path.join(root, 'prisma', 'schema.prisma')) || '';
    const providerMatch = schema.match(/provider\s*=\s*"(\w+)"/);
    if (providerMatch) {
      return { type: providerMatch[1], detected_from: 'prisma/schema.prisma' };
    }
  }

  if (fs.existsSync(path.join(root, 'database.sqlite'))) {
    return { type: 'sqlite', path: path.join(root, 'database.sqlite'), detected_from: 'file-scan' };
  }

  return null;
}

function detectCommands(root, lang, framework) {
  const cmds = {};
  const pkg = readJson(path.join(root, 'package.json'));
  const composer = readJson(path.join(root, 'composer.json'));

  if (lang === 'php' && framework === 'laravel') {
    cmds.test = 'php artisan test';
    cmds.serve = 'php artisan serve';
    cmds.migrate = 'php artisan migrate';
    cmds.build = 'npm run build';
    cmds.seed = 'php artisan db:seed';
    cmds.tinker = 'php artisan tinker';
  } else if (lang === 'php' && framework === 'symfony') {
    cmds.test = 'php bin/phpunit';
    cmds.serve = 'symfony server:start';
    cmds.migrate = 'php bin/console doctrine:migrations:migrate';
    cmds.build = 'npm run build';
  } else if (lang === 'python' && framework === 'django') {
    cmds.test = 'python manage.py test';
    cmds.serve = 'python manage.py runserver';
    cmds.migrate = 'python manage.py migrate';
    cmds.seed = 'python manage.py loaddata';
    cmds.shell = 'python manage.py shell';
  } else if (lang === 'python' && framework === 'fastapi') {
    cmds.test = 'pytest';
    cmds.serve = 'uvicorn main:app --reload';
  } else if (lang === 'python') {
    cmds.test = 'pytest';
  } else if (lang === 'rust') {
    cmds.test = 'cargo test';
    cmds.serve = 'cargo run';
    cmds.build = 'cargo build';
  } else if (lang === 'go') {
    cmds.test = 'go test ./...';
    cmds.serve = 'go run .';
    cmds.build = 'go build';
  } else if (lang === 'ruby' && framework === 'rails') {
    cmds.test = 'bin/rails test';
    cmds.serve = 'bin/rails server';
    cmds.migrate = 'bin/rails db:migrate';
    cmds.build = 'bin/rails assets:precompile';
    cmds.console = 'bin/rails console';
  } else if (lang === 'typescript' || lang === 'javascript') {
    if (pkg) {
      const scripts = pkg.scripts || {};
      if (scripts.test) cmds.test = 'npm test';
      if (scripts.dev) cmds.serve = 'npm run dev';
      else if (scripts.start) cmds.serve = 'npm start';
      if (scripts.build) cmds.build = 'npm run build';
      if (scripts.migrate) cmds.migrate = 'npm run migrate';
      if (scripts.seed) cmds.seed = 'npm run seed';
    }
  }

  if (composer && composer.scripts) {
    if (composer.scripts.test && !cmds.test) cmds.test = 'composer test';
  }

  return Object.keys(cmds).length ? cmds : null;
}

function detectPaths(root, lang, framework) {
  const paths = {};
  const exists = (p) => fs.existsSync(path.join(root, p));

  if (framework === 'laravel') {
    paths.migrations = 'database/migrations';
    paths.routes = 'routes/web.php';
    paths.models = 'app/Models';
    paths.controllers = 'app/Http/Controllers';
    paths.views = 'resources/views';
    paths.config = 'config';
    paths.env = '.env';
  } else if (framework === 'symfony') {
    paths.migrations = 'migrations';
    paths.routes = 'config/routes.yaml';
    paths.controllers = 'src/Controller';
    paths.entities = 'src/Entity';
    paths.env = '.env';
  } else if (framework === 'django') {
    paths.migrations = exists('app/migrations') ? 'app/migrations' : 'migrations';
    paths.routes = 'urls.py';
    paths.models = 'models.py';
    paths.settings = 'settings.py';
  } else if (framework === 'rails') {
    paths.migrations = 'db/migrate';
    paths.routes = 'config/routes.rb';
    paths.models = 'app/models';
    paths.controllers = 'app/controllers';
    paths.views = 'app/views';
  } else if (framework === 'nextjs') {
    paths.pages = 'pages';
    paths.app = 'app';
    paths.api = 'pages/api';
  } else if (framework === 'express') {
    paths.routes = 'routes';
    paths.models = 'models';
  }

  if (exists('prisma/schema.prisma')) {
    paths.prisma = 'prisma/schema.prisma';
  }

  if (exists('database/migrations')) paths.migrations = paths.migrations || 'database/migrations';
  if (exists('db/migrations')) paths.migrations = paths.migrations || 'db/migrations';

  return Object.keys(paths).length ? paths : null;
}

function detectSkipDirs(lang, framework) {
  const dirs = ['node_modules/', '.git/', '.lex/', 'vendor/', 'storage/', 'dist/', 'build/', '__pycache__/', '.next/', '.nuxt/', 'target/', 'bin/Debug/', 'bin/Release/'];

  if (lang === 'php') dirs.push('vendor/');
  if (lang === 'python') dirs.push('__pycache__/', '.venv/', 'venv/', '.mypy_cache/');
  if (lang === 'rust') dirs.push('target/');
  if (lang === 'go') dirs.push('vendor/');
  if (lang === 'ruby') dirs.push('tmp/', 'log/', '.bundle/');
  if (lang === 'typescript' || lang === 'javascript') dirs.push('node_modules/', 'dist/', '.next/', '.turbo/');

  return [...new Set(dirs)];
}

function detectSchemaFormats(lang, framework) {
  const formats = [];
  if (lang === 'php') formats.push('.php');
  if (lang === 'ruby') formats.push('.rb');
  formats.push('.sql');
  if (lang === 'typescript' || lang === 'javascript') {
    if (fs.existsSync('prisma/schema.prisma')) formats.push('.prisma');
  }
  return formats;
}

function detectAll(root) {
  const { language, framework, version, package: pkgName, module } = detectLanguageAndFramework(root);
  const database = detectDatabase(root, language, framework);
  const commands = detectCommands(root, language, framework);
  const paths = detectPaths(root, language, framework);
  const skipDirs = detectSkipDirs(language, framework);
  const schemaFormats = detectSchemaFormats(language, framework);

  const config = {
    version: 1,
    language: language || '',
    framework: framework || '',
    detected_at: new Date().toISOString(),
    detected_by: 'lex-auto',
  };

  if (version) config.framework_version = version;
  if (pkgName) config.package = pkgName;
  if (module) config.module = module;
  if (database) config.database = database;
  if (commands) config.commands = commands;
  if (paths) config.paths = paths;
  config.skip_dirs = skipDirs;
  config.schema_formats = schemaFormats;

  return config;
}

function mergeConfig(existing, detected) {
  if (!existing) return detected;
  const merged = { ...existing };
  for (const key of Object.keys(detected)) {
    if (key === 'detected_at' || key === 'detected_by') continue;
    if (merged[key] === undefined || merged[key] === '' || merged[key] === null) {
      merged[key] = detected[key];
    }
  }
  return merged;
}

function getOrDetect(root) {
  const existing = loadConfig(root);
  if (existing) return existing;
  const detected = detectAll(root);
  saveConfig(root, detected);
  return detected;
}

module.exports = {
  configPath,
  loadConfig,
  saveConfig,
  detectAll,
  detectLanguageAndFramework,
  detectDatabase,
  detectCommands,
  detectPaths,
  detectSkipDirs,
  detectSchemaFormats,
  mergeConfig,
  getOrDetect,
  readEnv,
};
