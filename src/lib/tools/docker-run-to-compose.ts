/**
 * Docker Run to Compose: turns a `docker run` command line into a Compose
 * service.
 *
 * `convertDockerRun(text)` tokenizes the command the way a POSIX shell would,
 * reads the flags (the table in docker-run-to-compose-data.ts), and returns a
 * plain object ready to be dumped as YAML, plus two lists for the reader:
 * `notes` explain what Compose does differently, `warnings` list everything
 * that could not be converted. Nothing is dropped silently. No React, no DOM,
 * no YAML library: the caller serialises `compose` (see COMPOSE_YAML_OPTIONS).
 */

import {
  FLAGS_BY_LONG_NAME,
  FLAGS_BY_SHORT_NAME,
  SERVICE_KEY_ORDER,
  type CustomFlagId,
  type FlagDef,
  type HealthField,
} from './docker-run-to-compose-data';

// ── Result types ──────────────────────────────────────────────────────────────

export type ComposeService = { image: string } & Record<string, unknown>;

export interface ComposeFile {
  services: Record<string, ComposeService>;
  volumes?: Record<string, Record<string, never>>;
  networks?: Record<string, { external: true }>;
}

export type ConversionResult =
  | {
      ok: true;
      /** Key of the single service in `compose.services`. */
      serviceName: string;
      compose: ComposeFile;
      /** What Compose does differently from docker run. */
      notes: string[];
      /** Flags and values that were not (fully) converted. */
      warnings: string[];
    }
  | { ok: false; error: string };

/** Options for `yaml.dump` that give the usual docker-compose.yml look. */
export const COMPOSE_YAML_OPTIONS = {
  indent: 2,
  lineWidth: -1,
  noRefs: true,
  quotingType: '"' as const,
};

/** A realistic command for the "load example" button. */
export const EXAMPLE_DOCKER_RUN = `docker run -d \\
  --name web \\
  --restart unless-stopped \\
  -p 8080:80 \\
  -v web_data:/usr/share/nginx/html \\
  -v ./conf/nginx.conf:/etc/nginx/nginx.conf:ro \\
  -e TZ=Europe/Berlin \\
  --network proxy \\
  --health-cmd "curl -f http://localhost/ || exit 1" \\
  --health-interval 30s \\
  --memory 512m \\
  nginx:1.27-alpine`;

// ── Tokenizer ─────────────────────────────────────────────────────────────────

export interface TokenizeOptions {
  /**
   * Write a literal dollar sign (single-quoted or backslash-escaped) as `$$`,
   * because Compose treats a lone `$` as the start of a variable. References
   * such as `$HOME` or `${PORT}` are kept as they are.
   */
  escapeDollars?: boolean;
}

export type TokenizeResult =
  | {
      ok: true;
      tokens: string[];
      /** Text after the end of the first command (a new line, `;`, `&&`, `|`), trimmed. */
      ignored: string;
    }
  | { ok: false; error: string };

const BACKSLASH_CONTINUATION = /\\[ \t]*\r?\n/y;
// cmd.exe and PowerShell continue a line with ^ and ` instead.
const WINDOWS_CONTINUATION = /[\^`][ \t]*\r?\n/y;
// Characters a backslash outside quotes escapes: whitespace, quotes and shell metacharacters.
const ESCAPABLE = ' \t\'"\\$`;|&<>()#*?[]{}~!';
const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_]/;

/** Reads the expansion that starts with `$` at `start`: `$(..)`, `${..}`, `$NAME`, or a lone `$`. */
function readDollar(input: string, start: number, escapeDollars: boolean): { text: string; end: number } {
  const next = input[start + 1];
  if (next === '(' || next === '{') {
    const close = next === '(' ? ')' : '}';
    let depth = 0;
    for (let j = start + 1; j < input.length; j++) {
      if (input[j] === next) depth++;
      else if (input[j] === close && --depth === 0) {
        return { text: input.slice(start, j + 1), end: j + 1 };
      }
    }
    return { text: input.slice(start), end: input.length };
  }
  if (next !== undefined && NAME_START.test(next)) {
    let j = start + 2;
    while (j < input.length && NAME_CHAR.test(input[j])) j++;
    return { text: input.slice(start, j), end: j };
  }
  return { text: escapeDollars ? '$$' : '$', end: start + 1 };
}

function hasContent(rest: string): boolean {
  // A trailing ";" or "&" is harmless; so is a comment.
  if (/^[;&\s]*$/.test(rest)) return false;
  return rest.split(/\r?\n/).some((line) => line.trim() !== '' && !line.trim().startsWith('#'));
}

/**
 * Splits a command line into arguments with POSIX shell rules: whitespace
 * separates, single quotes are literal, double quotes allow `\"`, `\\`, `\$`
 * and `\`` escapes, a backslash before a line break continues the line, and
 * `#` starts a comment. The first command ends at an unquoted new line, `;`,
 * `|` or `&`; whatever follows is returned as `ignored`.
 *
 * One deliberate difference: outside quotes a backslash escapes only
 * whitespace, quotes and shell metacharacters. Before a letter or digit it
 * stays, so a pasted Windows path such as `C:\data` survives.
 */
export function tokenize(input: string, options: TokenizeOptions = {}): TokenizeResult {
  const escapeDollars = options.escapeDollars === true;
  const tokens: string[] = [];
  let current = '';
  let inToken = false;
  let ignored = '';
  let i = 0;

  const append = (text: string) => {
    current += text;
    inToken = true;
  };
  const endToken = () => {
    if (inToken) tokens.push(current);
    current = '';
    inToken = false;
  };

  while (i < input.length) {
    const ch = input[i];

    if (ch === '\\') {
      BACKSLASH_CONTINUATION.lastIndex = i;
      const continuation = BACKSLASH_CONTINUATION.exec(input);
      if (continuation) {
        i += continuation[0].length;
        continue;
      }
      const next = input[i + 1];
      if (next !== undefined && ESCAPABLE.includes(next)) {
        append(next === '$' && escapeDollars ? '$$' : next);
        i += 2;
      } else {
        // Unlike a POSIX shell, keep the backslash before an ordinary character: in a docker
        // command it is far more likely part of a Windows path (C:\data) than a stray escape.
        append('\\');
        i++;
      }
      continue;
    }

    if (ch === "'") {
      const close = input.indexOf("'", i + 1);
      if (close === -1) return { ok: false, error: "Unterminated single quote (')." };
      const text = input.slice(i + 1, close);
      append(escapeDollars ? text.split('$').join('$$') : text);
      i = close + 1;
      continue;
    }

    if (ch === '"') {
      let text = '';
      let closed = false;
      let j = i + 1;
      while (j < input.length) {
        const c = input[j];
        if (c === '"') {
          closed = true;
          j++;
          break;
        }
        if (c === '\\') {
          const next = input[j + 1];
          if (next === '"' || next === '\\' || next === '`') {
            text += next;
            j += 2;
          } else if (next === '$') {
            text += escapeDollars ? '$$' : '$';
            j += 2;
          } else if (next === '\n') {
            j += 2;
          } else if (next === '\r' && input[j + 2] === '\n') {
            j += 3;
          } else {
            text += '\\';
            j++;
          }
          continue;
        }
        if (c === '$') {
          const dollar = readDollar(input, j, escapeDollars);
          text += dollar.text;
          j = dollar.end;
          continue;
        }
        text += c;
        j++;
      }
      if (!closed) return { ok: false, error: 'Unterminated double quote (").' };
      append(text);
      i = j;
      continue;
    }

    if (ch === '$') {
      const dollar = readDollar(input, i, escapeDollars);
      append(dollar.text);
      i = dollar.end;
      continue;
    }

    if (ch === '\n') {
      endToken();
      if (tokens.length > 0) {
        ignored = input.slice(i + 1);
        break;
      }
      i++;
      continue;
    }

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      endToken();
      i++;
      continue;
    }

    if (!inToken) {
      if (ch === '#') {
        const lineEnd = input.indexOf('\n', i);
        i = lineEnd === -1 ? input.length : lineEnd;
        continue;
      }
      if (ch === '^' || ch === '`') {
        WINDOWS_CONTINUATION.lastIndex = i;
        const continuation = WINDOWS_CONTINUATION.exec(input);
        if (continuation) {
          i += continuation[0].length;
          continue;
        }
      }
    }

    if (
      ch === ';' ||
      ch === '|' ||
      (ch === '&' && !/[<>]$/.test(current) && input[i + 1] !== '>')
    ) {
      endToken();
      ignored = input.slice(i);
      break;
    }

    append(ch);
    i++;
  }

  endToken();
  ignored = ignored.trim();
  return { ok: true, tokens, ignored: hasContent(ignored) ? ignored : '' };
}

// ── Conversion ────────────────────────────────────────────────────────────────

interface Context {
  service: Record<string, unknown>;
  name?: string;
  volumes: Set<string>;
  networks: string[];
  networkMode?: string;
  aliases: string[];
  ipv4?: string;
  ipv6?: string;
  logDriver?: string;
  logOptions: Record<string, string>;
  ulimits: Record<string, number | { soft: number; hard: number }>;
  storageOptions: Record<string, string>;
  health: Partial<Record<HealthField, unknown>>;
  notes: string[];
  warnings: string[];
}

const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const NAMED_VOLUME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[\\/]/;
const CURRENT_DIRECTORY = /^(?:\$\(pwd\)|\$\{PWD\}|\$PWD)(?=$|[/:\\])/;
const RESTART_POLICY = /^(?:no|always|unless-stopped|on-failure(?::\d+)?)$/;
const MOUNT_TYPES = ['bind', 'volume', 'tmpfs', 'npipe'];

function note(ctx: Context, message: string): void {
  if (!ctx.notes.includes(message)) ctx.notes.push(message);
}

function warn(ctx: Context, message: string): void {
  if (!ctx.warnings.includes(message)) ctx.warnings.push(message);
}

function pushToList(ctx: Context, key: string, item: unknown): void {
  const list = ctx.service[key];
  if (Array.isArray(list)) list.push(item);
  else ctx.service[key] = [item];
}

function parseBool(value: string): boolean | undefined {
  const text = value.toLowerCase();
  if (text === '1' || text === 't' || text === 'true') return true;
  if (text === '0' || text === 'f' || text === 'false') return false;
  return undefined;
}

/** A whole number stays a number, "512m" stays text. */
function sizeValue(value: string): number | string {
  return /^-?\d+$/.test(value) ? Number(value) : value;
}

/** Splits `a=1,"b,c"=2` style option lists, as used by --mount and --network. */
function splitCsv(value: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      fields.push(current);
      current = '';
    } else current += ch;
  }
  fields.push(current);
  return fields.filter((field) => field.trim() !== '');
}

/** `$(pwd)/data` and `$PWD/data` become `./data`, which Compose resolves next to the file. */
function relativeToCompose(ctx: Context, path: string): string {
  if (!CURRENT_DIRECTORY.test(path)) return path;
  note(
    ctx,
    'Host paths that start with the current directory ($(pwd) or $PWD) were written as ".". Compose resolves them relative to the folder that holds the compose file.'
  );
  return path.replace(CURRENT_DIRECTORY, '.');
}

/** The name of a named volume in a short `source:target` spec, or undefined for paths and anonymous volumes. */
function namedVolumeOf(spec: string): string | undefined {
  if (WINDOWS_DRIVE_PATH.test(spec)) return undefined;
  const colon = spec.indexOf(':');
  if (colon <= 0) return undefined;
  const source = spec.slice(0, colon);
  return NAMED_VOLUME.test(source) ? source : undefined;
}

function convertMount(ctx: Context, display: string, value: string): void {
  let type = 'volume';
  let source: string | undefined;
  let target: string | undefined;
  let readOnly = false;
  const bind: Record<string, unknown> = {};
  const volume: Record<string, unknown> = {};
  const tmpfs: Record<string, unknown> = {};

  for (const field of splitCsv(value)) {
    const eq = field.indexOf('=');
    const key = (eq === -1 ? field : field.slice(0, eq)).trim().toLowerCase();
    const val = eq === -1 ? '' : field.slice(eq + 1).trim();
    const flag = eq === -1 || parseBool(val) !== false;
    switch (key) {
      case 'type':
        type = val.toLowerCase();
        break;
      case 'source':
      case 'src':
        source = val;
        break;
      case 'target':
      case 'destination':
      case 'dst':
        target = val;
        break;
      case 'readonly':
      case 'ro':
        readOnly = flag;
        break;
      case 'bind-propagation':
        bind.propagation = val;
        break;
      case 'volume-nocopy':
        volume.nocopy = flag;
        break;
      case 'volume-subpath':
        volume.subpath = val;
        break;
      case 'tmpfs-size':
        tmpfs.size = sizeValue(val);
        break;
      default:
        warn(ctx, `The "${key}" option of \`--mount\` was not converted (\`${display}\`).`);
    }
  }

  if (!MOUNT_TYPES.includes(type)) {
    warn(ctx, `\`${display}\` was not converted: mount type "${type}" is not supported.`);
    return;
  }
  if (!target) {
    warn(ctx, `\`${display}\` was not converted: it has no target.`);
    return;
  }
  if (type === 'bind' && !source) {
    warn(ctx, `\`${display}\` was not converted: a bind mount needs a source.`);
    return;
  }

  const entry: Record<string, unknown> = { type };
  if (source) entry.source = type === 'bind' ? relativeToCompose(ctx, source) : source;
  entry.target = target;
  if (readOnly) entry.read_only = true;
  if (Object.keys(bind).length) entry.bind = bind;
  if (Object.keys(volume).length) entry.volume = volume;
  if (Object.keys(tmpfs).length) entry.tmpfs = tmpfs;
  pushToList(ctx, 'volumes', entry);

  if (type === 'volume' && source && NAMED_VOLUME.test(source)) ctx.volumes.add(source);
}

function convertNetwork(ctx: Context, display: string, value: string): void {
  let name = value;
  if (value.includes('=')) {
    name = '';
    for (const field of splitCsv(value)) {
      const eq = field.indexOf('=');
      const key = field.slice(0, eq === -1 ? undefined : eq).trim().toLowerCase();
      const val = eq === -1 ? '' : field.slice(eq + 1).trim();
      if (key === 'name') name = val;
      else if (key === 'alias') ctx.aliases.push(val);
      else if (key === 'ip') ctx.ipv4 = val;
      else if (key === 'ip6') ctx.ipv6 = val;
      else warn(ctx, `The "${key}" option of \`--network\` was not converted (\`${display}\`).`);
    }
  }
  if (!name) {
    warn(ctx, `\`${display}\` names no network and was skipped.`);
  } else if (name === 'host' || name === 'none' || name === 'bridge' || name.startsWith('container:')) {
    ctx.networkMode = name;
  } else if (!ctx.networks.includes(name)) {
    ctx.networks.push(name);
  }
}

function convertGpus(ctx: Context, display: string, value: string): void {
  const spec = value.replace(/^"|"$/g, '');
  const reservation: Record<string, unknown> = { driver: 'nvidia' };
  const deviceIds = /^device=(.+)$/.exec(spec);
  if (spec === 'all' || spec === '-1') reservation.count = 'all';
  else if (/^\d+$/.test(spec)) reservation.count = Number(spec);
  else if (deviceIds) reservation.device_ids = deviceIds[1].split(',').map((id) => id.trim());
  else {
    warn(ctx, `\`${display}\` was not converted: only "all", a count, or "device=<ids>" are understood.`);
    return;
  }
  reservation.capabilities = ['gpu'];
  ctx.service.deploy = { resources: { reservations: { devices: [reservation] } } };
  note(ctx, '--gpus is written as a GPU device reservation. It needs the NVIDIA Container Toolkit on the host.');
}

function applyCustom(ctx: Context, id: CustomFlagId, display: string, value: string): void {
  switch (id) {
    case 'name':
      ctx.name = value;
      ctx.service.container_name = value;
      return;

    case 'restart':
      if (!RESTART_POLICY.test(value)) {
        warn(ctx, `\`${display}\` is not a restart policy Docker knows (no, always, unless-stopped, on-failure[:N]). It was copied as is.`);
      }
      ctx.service.restart = value;
      return;

    case 'entrypoint':
      // docker run takes the whole value as the program; an empty value resets the image's entrypoint.
      ctx.service.entrypoint = value === '' ? [] : [value];
      return;

    case 'label':
      if (value.trim() === '') warn(ctx, `\`${display}\` has an empty value and was skipped.`);
      else pushToList(ctx, 'labels', value.includes('=') ? value : `${value}=`);
      return;

    case 'link':
      pushToList(ctx, 'links', value);
      note(
        ctx,
        '--link is a legacy feature, and "links" in Compose refers to service names, not container names. Make sure the linked container is also a service in this file, or put both on a shared network.'
      );
      return;

    case 'volumes-from':
      pushToList(ctx, 'volumes_from', `container:${value}`);
      return;

    case 'volume': {
      const spec = relativeToCompose(ctx, value);
      pushToList(ctx, 'volumes', spec);
      const named = namedVolumeOf(spec);
      if (named) ctx.volumes.add(named);
      return;
    }

    case 'mount':
      convertMount(ctx, display, value);
      return;

    case 'network':
      convertNetwork(ctx, display, value);
      return;

    case 'network-alias':
      ctx.aliases.push(value);
      return;

    case 'ip':
      ctx.ipv4 = value;
      return;

    case 'ip6':
      ctx.ipv6 = value;
      return;

    case 'ulimit': {
      const match = /^([a-z]+)=(-?\d+)(?::(-?\d+))?$/.exec(value);
      if (!match) {
        warn(ctx, `\`${display}\` was not converted: expected name=soft or name=soft:hard, for example nofile=1024:2048.`);
        return;
      }
      const [, limit, soft, hard] = match;
      ctx.ulimits[limit] = hard === undefined ? Number(soft) : { soft: Number(soft), hard: Number(hard) };
      return;
    }

    case 'log-driver':
      ctx.logDriver = value;
      return;

    case 'log-opt': {
      const eq = value.indexOf('=');
      if (eq <= 0) warn(ctx, `\`${display}\` was not converted: expected key=value.`);
      else ctx.logOptions[value.slice(0, eq)] = value.slice(eq + 1);
      return;
    }

    case 'storage-opt': {
      const eq = value.indexOf('=');
      if (eq <= 0) warn(ctx, `\`${display}\` was not converted: expected key=value.`);
      else ctx.storageOptions[value.slice(0, eq)] = value.slice(eq + 1);
      return;
    }

    case 'gpus':
      convertGpus(ctx, display, value);
      return;

    case 'stop-timeout':
      if (/^\d+$/.test(value)) ctx.service.stop_grace_period = `${value}s`;
      else warn(ctx, `\`${display}\` was not converted: expected a number of seconds.`);
      return;
  }
}

function applyHealth(ctx: Context, field: HealthField, display: string, value: string, enabled: boolean): void {
  switch (field) {
    case 'disable':
      if (enabled) ctx.health.disable = true;
      return;
    case 'test':
      // docker run reads --health-cmd as shell text, which is Compose's CMD-SHELL form.
      if (value === 'NONE') ctx.health.disable = true;
      else ctx.health.test = ['CMD-SHELL', value];
      return;
    case 'retries': {
      const retries = Number(value);
      if (/^\d+$/.test(value)) ctx.health.retries = retries;
      else warn(ctx, `\`${display}\` was not converted: expected a whole number.`);
      return;
    }
    default:
      ctx.health[field] = value;
  }
}

function applyFlag(ctx: Context, def: FlagDef, display: string, value: string, enabled: boolean): void {
  const { map } = def;
  switch (map.kind) {
    case 'note':
      if (def.takesValue || enabled !== (def.defaultsOn === true)) note(ctx, map.message);
      return;
    case 'warn':
      if (enabled) warn(ctx, `\`${display}\` was not converted. ${map.reason}`);
      return;
    case 'bool':
      if (enabled) ctx.service[map.key] = true;
      else delete ctx.service[map.key];
      return;
    case 'health':
      applyHealth(ctx, map.field, display, value, enabled);
      return;
    case 'custom':
      applyCustom(ctx, map.id, display, value);
      return;
  }

  if (value.trim() === '') {
    warn(ctx, `\`${display}\` has an empty value and was skipped.`);
    return;
  }
  switch (map.kind) {
    case 'string':
      ctx.service[map.key] = value;
      return;
    case 'bytes':
      ctx.service[map.key] = sizeValue(value);
      return;
    case 'list':
      pushToList(ctx, map.key, value);
      return;
    case 'number': {
      const number = Number(value);
      if (Number.isFinite(number)) ctx.service[map.key] = number;
      else warn(ctx, `\`${display}\` was not converted: "${value}" is not a number.`);
      return;
    }
  }
}

/** Reads the flag at `index`; returns the index of the next unread token. */
function readLongFlag(ctx: Context, tokens: string[], index: number): number {
  const token = tokens[index];
  const eq = token.indexOf('=');
  const flag = eq === -1 ? token : token.slice(0, eq);
  const inline = eq === -1 ? undefined : token.slice(eq + 1);
  const def = FLAGS_BY_LONG_NAME.get(flag);
  let next = index + 1;

  if (!def) {
    const following = tokens[next];
    const hint =
      inline === undefined && following !== undefined && !following.startsWith('-')
        ? ` If it takes a value, "${following}" may be mistaken for the image name.`
        : '';
    warn(ctx, `Unknown option \`${flag}\` was not converted.${hint}`);
    return next;
  }

  if (def.takesValue) {
    let value = inline;
    if (value === undefined) {
      value = tokens[next];
      next++;
    }
    if (value === undefined) {
      warn(ctx, `\`${flag}\` expects a value but none was given.`);
      return next;
    }
    applyFlag(ctx, def, `${flag} ${value}`, value, true);
    return next;
  }

  let enabled = true;
  if (inline !== undefined) {
    const parsed = parseBool(inline);
    if (parsed === undefined) {
      warn(ctx, `\`${token}\` is not a valid yes/no value and was skipped.`);
      return next;
    }
    enabled = parsed;
  }
  applyFlag(ctx, def, flag, '', enabled);
  return next;
}

/** Reads a cluster of short flags such as `-dit` or `-p8080:80`. */
function readShortFlags(ctx: Context, tokens: string[], index: number): number {
  const cluster = tokens[index].slice(1);
  let next = index + 1;

  for (let j = 0; j < cluster.length; j++) {
    const letter = cluster[j];
    const def = FLAGS_BY_SHORT_NAME.get(letter);
    if (!def) {
      warn(ctx, `Unknown option \`-${letter}\` was not converted.`);
      continue;
    }
    if (!def.takesValue) {
      applyFlag(ctx, def, `-${letter}`, '', true);
      continue;
    }
    // The rest of the cluster is the value (-p8080:80, -p=8080:80); otherwise the next argument is.
    const rest = cluster.slice(j + 1);
    let value: string | undefined;
    if (rest === '') {
      value = tokens[next];
      next++;
    } else {
      value = rest.startsWith('=') ? rest.slice(1) : rest;
    }
    if (value === undefined) warn(ctx, `\`-${letter}\` expects a value but none was given.`);
    else applyFlag(ctx, def, `-${letter} ${value}`, value, true);
    break;
  }
  return next;
}

function serviceNameFromImage(image: string): string {
  const withoutDigest = image.split('@')[0];
  const lastPart = withoutDigest.slice(withoutDigest.lastIndexOf('/') + 1);
  return lastPart.split(':')[0];
}

function toServiceName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '-');
}

/** Network settings: network_mode, the networks list, or the map form when aliases or addresses are set. */
function applyNetworks(ctx: Context): void {
  const hasEndpointOptions = ctx.aliases.length > 0 || Boolean(ctx.ipv4) || Boolean(ctx.ipv6);

  if (ctx.networkMode) {
    ctx.service.network_mode = ctx.networkMode;
    if (ctx.networks.length > 0) {
      warn(
        ctx,
        `Compose cannot combine network_mode with a networks list, so network_mode "${ctx.networkMode}" was kept and the network ${ctx.networks.map((name) => `"${name}"`).join(', ')} was dropped.`
      );
    }
    if (hasEndpointOptions) {
      warn(ctx, `--network-alias and --ip need a user-defined network and were skipped because the network mode is "${ctx.networkMode}".`);
    }
    return;
  }

  if (ctx.networks.length === 0 && (ctx.ipv4 || ctx.ipv6)) {
    warn(ctx, '--ip and --ip6 need a user-defined network (--network <name>) and were skipped.');
    ctx.ipv4 = undefined;
    ctx.ipv6 = undefined;
  }
  const hasOptions = ctx.aliases.length > 0 || Boolean(ctx.ipv4) || Boolean(ctx.ipv6);

  if (!hasOptions) {
    if (ctx.networks.length > 0) ctx.service.networks = [...ctx.networks];
    return;
  }

  // Aliases and addresses belong to one network; docker run applies them to the first one.
  const names = ctx.networks.length > 0 ? ctx.networks : ['default'];
  const map: Record<string, Record<string, unknown>> = {};
  for (const name of names) map[name] = {};
  const first = map[names[0]];
  if (ctx.aliases.length > 0) first.aliases = [...ctx.aliases];
  if (ctx.ipv4) first.ipv4_address = ctx.ipv4;
  if (ctx.ipv6) first.ipv6_address = ctx.ipv6;
  ctx.service.networks = map;
}

function orderedService(image: string, draft: Record<string, unknown>): ComposeService {
  const ordered: Record<string, unknown> = { image };
  for (const key of SERVICE_KEY_ORDER) {
    if (key !== 'image' && draft[key] !== undefined) ordered[key] = draft[key];
  }
  for (const key of Object.keys(draft)) {
    if (!(key in ordered)) ordered[key] = draft[key];
  }
  return ordered as ComposeService;
}

function notRunMessage(tokens: string[], start: number): string {
  if (tokens[start] === 'docker' && tokens[start + 1]) {
    return `Only "docker run" can be converted, but this command is "docker ${tokens[start + 1]}".`;
  }
  return 'This does not look like a docker run command. It should start with "docker run".';
}

/** Converts one `docker run` command into a Compose file with a single service. */
export function convertDockerRun(input: string): ConversionResult {
  // Drop a pasted shell prompt such as "$ docker run ...".
  const text = input.replace(/^\s*\$\s+/, '');
  if (text.trim() === '') return { ok: false, error: 'Paste a docker run command to convert it.' };

  const tokenized = tokenize(text, { escapeDollars: true });
  if (!tokenized.ok) return { ok: false, error: tokenized.error };
  const { tokens, ignored } = tokenized;

  const ctx: Context = {
    service: {},
    volumes: new Set(),
    networks: [],
    aliases: [],
    logOptions: {},
    ulimits: {},
    storageOptions: {},
    health: {},
    notes: [],
    warnings: [],
  };

  let start = 0;
  while (start < tokens.length) {
    const token = tokens[start];
    if (token === 'sudo') {
      start++;
    } else if (ENV_ASSIGNMENT.test(token)) {
      warn(ctx, `The environment prefix \`${token}\` before the command was ignored. Put it under environment if the container needs it.`);
      start++;
    } else {
      break;
    }
  }

  const dockerIndex = start;
  if (tokens[dockerIndex] !== 'docker') return { ok: false, error: notRunMessage(tokens, dockerIndex) };
  start++;
  if (tokens[start] === 'container') start++;
  if (tokens[start] !== 'run') return { ok: false, error: notRunMessage(tokens, dockerIndex) };
  start++;

  // Flags run up to the image; everything after the image is the container's command.
  let i = start;
  let image: string | undefined;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === '--') {
      image = tokens[i + 1];
      i += 2;
      break;
    }
    if (token.startsWith('--')) {
      i = readLongFlag(ctx, tokens, i);
    } else if (token.length > 1 && token.startsWith('-')) {
      i = readShortFlags(ctx, tokens, i);
    } else {
      image = token;
      i++;
      break;
    }
  }

  if (!image) {
    const hint = ignored
      ? ' A line break ends the command unless the line ends with a backslash (\\), so options on later lines were not read.'
      : '';
    return { ok: false, error: `No image name found after the options.${hint}` };
  }

  const command = tokens.slice(i);
  if (command.length > 0) ctx.service.command = command;
  if (ignored) {
    const shown = ignored.length > 80 ? `${ignored.slice(0, 80)}...` : ignored;
    warn(ctx, `Only the first command was converted. This text after it was ignored: ${shown}`);
  }

  if (ctx.logDriver || Object.keys(ctx.logOptions).length > 0) {
    const logging: Record<string, unknown> = {};
    if (ctx.logDriver) logging.driver = ctx.logDriver;
    if (Object.keys(ctx.logOptions).length > 0) logging.options = ctx.logOptions;
    ctx.service.logging = logging;
  }
  if (Object.keys(ctx.ulimits).length > 0) ctx.service.ulimits = ctx.ulimits;
  if (Object.keys(ctx.storageOptions).length > 0) ctx.service.storage_opt = ctx.storageOptions;
  if (ctx.health.disable) {
    ctx.service.healthcheck = { disable: true };
  } else if (Object.keys(ctx.health).length > 0) {
    const { test, interval, timeout, retries, start_period, start_interval } = ctx.health;
    const healthcheck: Record<string, unknown> = {};
    const fields = { test, interval, timeout, retries, start_period, start_interval };
    for (const [key, field] of Object.entries(fields)) {
      if (field !== undefined) healthcheck[key] = field;
    }
    ctx.service.healthcheck = healthcheck;
  }
  applyNetworks(ctx);

  const baseName = ctx.name ?? serviceNameFromImage(image);
  const serviceName = toServiceName(baseName) || 'app';
  if (ctx.name && serviceName !== ctx.name) {
    note(
      ctx,
      `The service is called "${serviceName}" because service names may only use letters, digits, ".", "_" and "-". The container name is still "${ctx.name}".`
    );
  }

  const service = orderedService(image, ctx.service);
  const compose: ComposeFile = { services: { [serviceName]: service } };

  if (ctx.volumes.size > 0) {
    compose.volumes = Object.fromEntries([...ctx.volumes].map((name) => [name, {}]));
    note(
      ctx,
      'Named volumes are declared under the top-level volumes section. Compose prefixes their real names with the project name; add "name: <volume>" or "external: true" to a volume to keep using data that docker run already created.'
    );
  }
  if (ctx.networks.length > 0 && !ctx.networkMode) {
    compose.networks = Object.fromEntries(ctx.networks.map((name) => [name, { external: true as const }]));
    note(
      ctx,
      'Networks are declared external because docker run only joins networks that already exist. Remove "external: true" to let Compose create the network instead.'
    );
  }

  const serialized = JSON.stringify(service);
  const withoutEscapedDollars = serialized.replace(/\$\$/g, '');
  if (withoutEscapedDollars.includes('$(')) {
    warn(ctx, 'A value contains command substitution ($(...)). Compose does not run commands. Replace it with a fixed value or a ${VARIABLE}.');
  }
  if (withoutEscapedDollars.length !== serialized.length) {
    note(ctx, 'A literal dollar sign is written as $$ because Compose reads a single $ as the start of a variable.');
  }
  if (/\$[A-Za-z_{]/.test(withoutEscapedDollars)) {
    note(
      ctx,
      'Variables such as $HOME or ${PORT} are filled in by Compose from your shell or a .env file when you run it, much as your shell did for docker run.'
    );
  }

  return { ok: true, serviceName, compose, notes: ctx.notes, warnings: ctx.warnings };
}
