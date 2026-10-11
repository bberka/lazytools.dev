/**
 * The `docker run` flag table behind docker-run-to-compose.
 *
 * Every flag `docker run` accepts is listed here, even those with no Compose
 * equivalent, because the parser has to know whether a flag takes a value to
 * tell its value apart from the image name. Pure data: no imports, no logic.
 */

/** Flags whose conversion needs code rather than a plain copy. */
export type CustomFlagId =
  | 'name'
  | 'restart'
  | 'entrypoint'
  | 'label'
  | 'link'
  | 'volumes-from'
  | 'volume'
  | 'mount'
  | 'network'
  | 'network-alias'
  | 'ip'
  | 'ip6'
  | 'ulimit'
  | 'log-driver'
  | 'log-opt'
  | 'gpus'
  | 'storage-opt'
  | 'stop-timeout';

/** The parts of a Compose `healthcheck` block a flag can fill in. */
export type HealthField =
  | 'test'
  | 'interval'
  | 'timeout'
  | 'retries'
  | 'start_period'
  | 'start_interval'
  | 'disable';

export type FlagMapping =
  /** One value copied to a service key; the last occurrence wins. */
  | { kind: 'string'; key: string }
  /** A number copied to a service key. */
  | { kind: 'number'; key: string }
  /** A size: whole numbers become numbers, "512m" stays text. */
  | { kind: 'bytes'; key: string }
  /** A switch that sets a service key to true. */
  | { kind: 'bool'; key: string }
  /** A repeatable flag collected into a list. */
  | { kind: 'list'; key: string }
  | { kind: 'health'; field: HealthField }
  | { kind: 'custom'; id: CustomFlagId }
  /** Understood and harmless to drop; reported in the notes list. */
  | { kind: 'note'; message: string }
  /** Understood but changes behaviour that Compose cannot reproduce; reported as a warning. */
  | { kind: 'warn'; reason: string };

export interface FlagDef {
  /** Long name including the dashes, e.g. `--publish`. */
  name: string;
  /** Single-letter form including the dash, e.g. `-p`. */
  short?: string;
  /** Other long spellings, e.g. `--net` for `--network`. */
  aliases?: string[];
  takesValue: boolean;
  /** For a switch that is on unless turned off (`--sig-proxy`): only `=false` is worth a note. */
  defaultsOn?: boolean;
  map: FlagMapping;
}

const value = (name: string, map: FlagMapping, extra: Partial<FlagDef> = {}): FlagDef => ({
  name,
  takesValue: true,
  map,
  ...extra,
});

const toggle = (name: string, map: FlagMapping, extra: Partial<FlagDef> = {}): FlagDef => ({
  name,
  takesValue: false,
  map,
  ...extra,
});

export const FLAG_DEFS: FlagDef[] = [
  // Identity and process
  value('--name', { kind: 'custom', id: 'name' }),
  value('--hostname', { kind: 'string', key: 'hostname' }, { short: '-h' }),
  value('--domainname', { kind: 'string', key: 'domainname' }),
  value('--user', { kind: 'string', key: 'user' }, { short: '-u' }),
  value('--workdir', { kind: 'string', key: 'working_dir' }, { short: '-w' }),
  value('--entrypoint', { kind: 'custom', id: 'entrypoint' }),
  toggle('--interactive', { kind: 'bool', key: 'stdin_open' }, { short: '-i' }),
  toggle('--tty', { kind: 'bool', key: 'tty' }, { short: '-t' }),
  toggle('--init', { kind: 'bool', key: 'init' }),
  toggle('--read-only', { kind: 'bool', key: 'read_only' }),
  value('--restart', { kind: 'custom', id: 'restart' }),
  value('--platform', { kind: 'string', key: 'platform' }),
  value('--pull', { kind: 'string', key: 'pull_policy' }),
  value('--runtime', { kind: 'string', key: 'runtime' }),
  value('--stop-signal', { kind: 'string', key: 'stop_signal' }),
  value('--stop-timeout', { kind: 'custom', id: 'stop-timeout' }),

  // Environment and metadata
  value('--env', { kind: 'list', key: 'environment' }, { short: '-e' }),
  value('--env-file', { kind: 'list', key: 'env_file' }),
  value('--label', { kind: 'custom', id: 'label' }, { short: '-l' }),
  value('--label-file', {
    kind: 'warn',
    reason: 'Compose has no label file. Move the labels into the labels list.',
  }),
  value('--annotation', {
    kind: 'warn',
    reason: 'Compose has no annotations setting.',
  }),

  // Storage
  value('--volume', { kind: 'custom', id: 'volume' }, { short: '-v' }),
  value('--mount', { kind: 'custom', id: 'mount' }),
  value('--volumes-from', { kind: 'custom', id: 'volumes-from' }),
  value('--tmpfs', { kind: 'list', key: 'tmpfs' }),
  value('--volume-driver', {
    kind: 'warn',
    reason: 'Set the driver on the named volume under the top-level volumes section instead.',
  }),
  value('--storage-opt', { kind: 'custom', id: 'storage-opt' }),

  // Networking
  value('--publish', { kind: 'list', key: 'ports' }, { short: '-p' }),
  toggle(
    '--publish-all',
    {
      kind: 'warn',
      reason: 'Compose cannot publish every exposed port at random. List the ports under ports.',
    },
    { short: '-P' }
  ),
  value('--expose', { kind: 'list', key: 'expose' }),
  value('--network', { kind: 'custom', id: 'network' }, { aliases: ['--net'] }),
  value('--network-alias', { kind: 'custom', id: 'network-alias' }, { aliases: ['--net-alias'] }),
  value('--ip', { kind: 'custom', id: 'ip' }),
  value('--ip6', { kind: 'custom', id: 'ip6' }),
  value('--link-local-ip', {
    kind: 'warn',
    reason: 'Compose supports link-local addresses only per network (link_local_ips).',
  }),
  value('--mac-address', { kind: 'string', key: 'mac_address' }),
  value('--add-host', { kind: 'list', key: 'extra_hosts' }),
  value('--dns', { kind: 'list', key: 'dns' }),
  value('--dns-search', { kind: 'list', key: 'dns_search' }),
  value('--dns-option', { kind: 'list', key: 'dns_opt' }),
  value('--link', { kind: 'custom', id: 'link' }),

  // Security and namespaces
  toggle('--privileged', { kind: 'bool', key: 'privileged' }),
  value('--cap-add', { kind: 'list', key: 'cap_add' }),
  value('--cap-drop', { kind: 'list', key: 'cap_drop' }),
  value('--security-opt', { kind: 'list', key: 'security_opt' }),
  value('--group-add', { kind: 'list', key: 'group_add' }),
  value('--sysctl', { kind: 'list', key: 'sysctls' }),
  value('--pid', { kind: 'string', key: 'pid' }),
  value('--ipc', { kind: 'string', key: 'ipc' }),
  value('--uts', { kind: 'string', key: 'uts' }),
  value('--userns', { kind: 'string', key: 'userns_mode' }),
  value('--cgroupns', { kind: 'string', key: 'cgroup' }),
  value('--cgroup-parent', { kind: 'string', key: 'cgroup_parent' }),
  value('--isolation', { kind: 'string', key: 'isolation' }),

  // Devices
  value('--device', { kind: 'list', key: 'devices' }),
  value('--device-cgroup-rule', { kind: 'list', key: 'device_cgroup_rules' }),
  value('--gpus', { kind: 'custom', id: 'gpus' }),

  // Resource limits
  value('--memory', { kind: 'bytes', key: 'mem_limit' }, { short: '-m' }),
  value('--memory-reservation', { kind: 'bytes', key: 'mem_reservation' }),
  value('--memory-swap', { kind: 'bytes', key: 'memswap_limit' }),
  value('--memory-swappiness', { kind: 'number', key: 'mem_swappiness' }),
  value('--kernel-memory', {
    kind: 'warn',
    reason: 'Docker removed kernel memory limits, so Compose has no equivalent.',
  }),
  value('--shm-size', { kind: 'bytes', key: 'shm_size' }),
  value('--cpus', { kind: 'number', key: 'cpus' }),
  value('--cpu-shares', { kind: 'number', key: 'cpu_shares' }, { short: '-c' }),
  value('--cpu-period', { kind: 'number', key: 'cpu_period' }),
  value('--cpu-quota', { kind: 'number', key: 'cpu_quota' }),
  value('--cpu-rt-period', { kind: 'number', key: 'cpu_rt_period' }),
  value('--cpu-rt-runtime', { kind: 'number', key: 'cpu_rt_runtime' }),
  value('--cpuset-cpus', { kind: 'string', key: 'cpuset' }),
  value('--cpuset-mems', {
    kind: 'warn',
    reason: 'Compose has no setting for memory nodes (cpuset-mems).',
  }),
  value('--pids-limit', { kind: 'number', key: 'pids_limit' }),
  value('--oom-score-adj', { kind: 'number', key: 'oom_score_adj' }),
  toggle('--oom-kill-disable', { kind: 'bool', key: 'oom_kill_disable' }),
  value('--ulimit', { kind: 'custom', id: 'ulimit' }),
  value('--blkio-weight', {
    kind: 'warn',
    reason: 'Compose keeps block I/O limits under blkio_config. Add it by hand.',
  }),
  value('--blkio-weight-device', {
    kind: 'warn',
    reason: 'Compose keeps block I/O limits under blkio_config. Add it by hand.',
  }),
  value('--device-read-bps', {
    kind: 'warn',
    reason: 'Compose keeps block I/O limits under blkio_config. Add it by hand.',
  }),
  value('--device-read-iops', {
    kind: 'warn',
    reason: 'Compose keeps block I/O limits under blkio_config. Add it by hand.',
  }),
  value('--device-write-bps', {
    kind: 'warn',
    reason: 'Compose keeps block I/O limits under blkio_config. Add it by hand.',
  }),
  value('--device-write-iops', {
    kind: 'warn',
    reason: 'Compose keeps block I/O limits under blkio_config. Add it by hand.',
  }),
  value('--io-maxbandwidth', { kind: 'warn', reason: 'This Windows-only limit has no Compose equivalent.' }),
  value('--io-maxiops', { kind: 'warn', reason: 'This Windows-only limit has no Compose equivalent.' }),
  value('--cpu-count', { kind: 'warn', reason: 'This Windows-only limit has no Compose equivalent.' }),
  value('--cpu-percent', { kind: 'warn', reason: 'This Windows-only limit has no Compose equivalent.' }),

  // Logging
  value('--log-driver', { kind: 'custom', id: 'log-driver' }),
  value('--log-opt', { kind: 'custom', id: 'log-opt' }),

  // Health check
  value('--health-cmd', { kind: 'health', field: 'test' }),
  value('--health-interval', { kind: 'health', field: 'interval' }),
  value('--health-timeout', { kind: 'health', field: 'timeout' }),
  value('--health-retries', { kind: 'health', field: 'retries' }),
  value('--health-start-period', { kind: 'health', field: 'start_period' }),
  value('--health-start-interval', { kind: 'health', field: 'start_interval' }),
  toggle('--no-healthcheck', { kind: 'health', field: 'disable' }),

  // Accepted by docker run, nothing to write in a Compose file
  toggle(
    '--detach',
    {
      kind: 'note',
      message:
        '-d / --detach is not needed in the file. Compose runs the service in the background when you start it with "docker compose up -d".',
    },
    { short: '-d' }
  ),
  toggle('--rm', {
    kind: 'note',
    message:
      '--rm has no Compose equivalent. Use "docker compose run --rm <service>" for a throwaway container, or "docker compose down" to remove the containers when you are done.',
  }),
  toggle(
    '--sig-proxy',
    {
      kind: 'note',
      message: '--sig-proxy only affects an attached terminal and has no Compose setting.',
    },
    { defaultsOn: true }
  ),
  toggle(
    '--quiet',
    {
      kind: 'note',
      message: '-q / --quiet only silences image pulls on the command line and has no Compose setting.',
    },
    { short: '-q' }
  ),
  toggle('--disable-content-trust', {
    kind: 'note',
    message:
      '--disable-content-trust has no Compose setting. Set DOCKER_CONTENT_TRUST=0 in the shell that runs "docker compose".',
  }),
  value('--detach-keys', {
    kind: 'note',
    message: '--detach-keys only affects an attached terminal and has no Compose setting.',
  }),
  value(
    '--attach',
    {
      kind: 'note',
      message:
        '-a / --attach has no Compose setting. Run "docker compose up" without -d to stay attached.',
    },
    { short: '-a' }
  ),
  value('--cidfile', {
    kind: 'note',
    message: '--cidfile has no Compose equivalent. Use "docker compose ps -q <service>" to get the container ID.',
  }),
  toggle('--use-api-socket', {
    kind: 'warn',
    reason: 'Mount the Docker socket as a volume instead.',
  }),
];

/** Lookup by `--long` name or alias, built once. */
export const FLAGS_BY_LONG_NAME: ReadonlyMap<string, FlagDef> = new Map(
  FLAG_DEFS.flatMap((def) => [def.name, ...(def.aliases ?? [])].map((name) => [name, def] as const))
);

/** Lookup by single letter without the dash, e.g. `p`. */
export const FLAGS_BY_SHORT_NAME: ReadonlyMap<string, FlagDef> = new Map(
  FLAG_DEFS.flatMap((def) => (def.short ? [[def.short.slice(1), def] as const] : []))
);

/** Order of keys inside the generated service, for a readable file. Keys not listed go last. */
export const SERVICE_KEY_ORDER: readonly string[] = [
  'image',
  'container_name',
  'platform',
  'pull_policy',
  'hostname',
  'domainname',
  'user',
  'group_add',
  'working_dir',
  'entrypoint',
  'command',
  'restart',
  'stdin_open',
  'tty',
  'init',
  'read_only',
  'privileged',
  'ports',
  'expose',
  'volumes',
  'volumes_from',
  'tmpfs',
  'environment',
  'env_file',
  'labels',
  'network_mode',
  'networks',
  'mac_address',
  'extra_hosts',
  'dns',
  'dns_search',
  'dns_opt',
  'links',
  'cap_add',
  'cap_drop',
  'security_opt',
  'sysctls',
  'devices',
  'device_cgroup_rules',
  'pid',
  'ipc',
  'uts',
  'userns_mode',
  'cgroup',
  'cgroup_parent',
  'isolation',
  'runtime',
  'mem_limit',
  'mem_reservation',
  'memswap_limit',
  'mem_swappiness',
  'shm_size',
  'cpus',
  'cpu_shares',
  'cpu_period',
  'cpu_quota',
  'cpu_rt_period',
  'cpu_rt_runtime',
  'cpuset',
  'pids_limit',
  'oom_score_adj',
  'oom_kill_disable',
  'ulimits',
  'storage_opt',
  'deploy',
  'logging',
  'healthcheck',
  'stop_signal',
  'stop_grace_period',
];
