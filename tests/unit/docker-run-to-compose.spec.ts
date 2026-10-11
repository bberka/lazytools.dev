import { test, expect } from '@playwright/test';
import { dump, load } from 'js-yaml';
import {
  COMPOSE_YAML_OPTIONS,
  EXAMPLE_DOCKER_RUN,
  convertDockerRun,
  tokenize,
} from '@/lib/tools/docker-run-to-compose';

/** Converts and fails the test if the command was rejected. */
function convert(command: string) {
  const result = convertDockerRun(command);
  if (!result.ok) throw new Error(`conversion failed: ${result.error}`);
  return result;
}

/** The single service a command turned into. */
function serviceOf(command: string) {
  const result = convert(command);
  return result.compose.services[result.serviceName];
}

function tokensOf(input: string, escapeDollars = false): string[] {
  const result = tokenize(input, { escapeDollars });
  if (!result.ok) throw new Error(result.error);
  return result.tokens;
}

test.describe('tokenizer', () => {
  test('splits on runs of spaces and tabs', () => {
    expect(tokensOf('docker  run\t-d   nginx')).toEqual(['docker', 'run', '-d', 'nginx']);
  });

  test('single quotes keep everything literal', () => {
    expect(tokensOf(`echo 'a "b" \\n $HOME  c'`)).toEqual(['echo', 'a "b" \\n $HOME  c']);
  });

  test('double quotes honour the escapes the shell honours', () => {
    expect(tokensOf('x "a \\"b\\" c"')).toEqual(['x', 'a "b" c']);
    expect(tokensOf('x "back\\\\slash"')).toEqual(['x', 'back\\slash']);
    // An unknown escape keeps its backslash.
    expect(tokensOf('x "a\\nb"')).toEqual(['x', 'a\\nb']);
    expect(tokensOf('x "cost \\$5"')).toEqual(['x', 'cost $5']);
  });

  test('quoted pieces next to each other form one argument', () => {
    expect(tokensOf(`a"b c"'d e'f`)).toEqual(['ab cd ef']);
    expect(tokensOf('FOO="bar baz"')).toEqual(['FOO=bar baz']);
  });

  test('a backslash outside quotes escapes the next character', () => {
    expect(tokensOf('a\\ b c')).toEqual(['a b', 'c']);
    expect(tokensOf('a\\"b')).toEqual(['a"b']);
  });

  test('a backslash before an ordinary character stays, so Windows paths survive', () => {
    expect(tokensOf('-v C:\\Users\\me\\data:/data')).toEqual(['-v', 'C:\\Users\\me\\data:/data']);
    expect(tokensOf('"C:\\Users\\me"')).toEqual(['C:\\Users\\me']);
    expect(tokensOf('trailing\\')).toEqual(['trailing\\']);
  });

  test('an empty quoted argument is kept', () => {
    expect(tokensOf(`--entrypoint ''`)).toEqual(['--entrypoint', '']);
    expect(tokensOf('--entrypoint ""')).toEqual(['--entrypoint', '']);
  });

  test('a backslash before a line break continues the line', () => {
    expect(tokensOf('docker run -d \\\n  --name web \\\n  nginx')).toEqual([
      'docker',
      'run',
      '-d',
      '--name',
      'web',
      'nginx',
    ]);
  });

  test('line continuations work with CRLF and with trailing spaces after the backslash', () => {
    expect(tokensOf('docker run \\\r\n  nginx')).toEqual(['docker', 'run', 'nginx']);
    expect(tokensOf('docker run \\   \n  nginx')).toEqual(['docker', 'run', 'nginx']);
  });

  test('a continuation inside double quotes joins the lines', () => {
    expect(tokensOf('x "ab\\\ncd"')).toEqual(['x', 'abcd']);
  });

  test('Windows line continuations (^ and backtick) are accepted', () => {
    expect(tokensOf('docker run -d ^\n --name web ^\n nginx')).toEqual([
      'docker',
      'run',
      '-d',
      '--name',
      'web',
      'nginx',
    ]);
    expect(tokensOf('docker run -d `\n nginx')).toEqual(['docker', 'run', '-d', 'nginx']);
  });

  test('comments are skipped, but # inside a word is not a comment', () => {
    expect(tokensOf('# setup\ndocker run -e A=#1 nginx # trailing')).toEqual([
      'docker',
      'run',
      '-e',
      'A=#1',
      'nginx',
    ]);
  });

  test('an unescaped line break ends the command and the rest is reported as ignored', () => {
    const result = tokenize('docker run nginx\ndocker logs x');
    expect(result).toEqual({ ok: true, tokens: ['docker', 'run', 'nginx'], ignored: 'docker logs x' });
  });

  test('control operators end the command', () => {
    expect(tokenize('docker run nginx && docker ps')).toEqual({
      ok: true,
      tokens: ['docker', 'run', 'nginx'],
      ignored: '&& docker ps',
    });
    expect(tokenize('docker run nginx | tee out')).toMatchObject({ ignored: '| tee out' });
    expect(tokenize('docker run nginx; echo done')).toMatchObject({ ignored: '; echo done' });
  });

  test('operators inside quotes, and redirections like 2>&1, do not end the command', () => {
    expect(tokensOf('sh -c "a && b; c | d"')).toEqual(['sh', '-c', 'a && b; c | d']);
    expect(tokensOf('run 2>&1 x')).toEqual(['run', '2>&1', 'x']);
  });

  test('a trailing semicolon or comment is not reported as ignored text', () => {
    expect(tokenize('docker run nginx;')).toMatchObject({ ignored: '' });
    expect(tokenize('docker run nginx\n# done\n')).toMatchObject({ ignored: '' });
  });

  test('unterminated quotes are an error, not an exception', () => {
    expect(tokenize(`docker run -e A='b`)).toEqual({ ok: false, error: "Unterminated single quote (')." });
    expect(tokenize('docker run -e "A=b')).toEqual({ ok: false, error: 'Unterminated double quote (").' });
  });

  test('empty input gives no tokens', () => {
    expect(tokenize('')).toEqual({ ok: true, tokens: [], ignored: '' });
    expect(tokenize('  \n\n  ')).toEqual({ ok: true, tokens: [], ignored: '' });
  });

  test('shell expansions stay in one argument', () => {
    expect(tokensOf('-v $(pwd)/data:/data')).toEqual(['-v', '$(pwd)/data:/data']);
    expect(tokensOf('-e A=${B:-x y}')).toEqual(['-e', 'A=${B:-x y}']);
    expect(tokensOf('-e "A=$(echo a b)"')).toEqual(['-e', 'A=$(echo a b)']);
  });

  test('escapeDollars writes literal dollar signs as $$ and keeps variable references', () => {
    expect(tokensOf(`'echo $HOME'`, true)).toEqual(['echo $$HOME']);
    expect(tokensOf('a\\$5', true)).toEqual(['a$$5']);
    expect(tokensOf('"cost \\$5"', true)).toEqual(['cost $$5']);
    expect(tokensOf('"home=$HOME"', true)).toEqual(['home=$HOME']);
    expect(tokensOf('${PORT}', true)).toEqual(['${PORT}']);
    expect(tokensOf('price$', true)).toEqual(['price$$']);
    expect(tokensOf('$ 5', true)).toEqual(['$$', '5']);
  });
});

test.describe('image, command and service name', () => {
  test('a bare image', () => {
    const result = convert('docker run nginx');
    expect(result.serviceName).toBe('nginx');
    expect(result.compose).toEqual({ services: { nginx: { image: 'nginx' } } });
    expect(result.notes).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test('arguments after the image are the command, even when they look like flags', () => {
    expect(serviceOf('docker run ubuntu:22.04 sleep 3600').command).toEqual(['sleep', '3600']);
    expect(serviceOf('docker run -d alpine ls -la --color -p 1').command).toEqual([
      'ls',
      '-la',
      '--color',
      '-p',
      '1',
    ]);
  });

  test('quoted command arguments stay whole', () => {
    expect(serviceOf(`docker run alpine sh -c "echo hello && sleep 5"`).command).toEqual([
      'sh',
      '-c',
      'echo hello && sleep 5',
    ]);
  });

  test('the service is named after the image, without registry, tag and digest', () => {
    expect(convert('docker run ghcr.io/acme/app:1.2').serviceName).toBe('app');
    expect(convert('docker run localhost:5000/team/tool').serviceName).toBe('tool');
    expect(convert('docker run redis@sha256:0123abcd').serviceName).toBe('redis');
    expect(serviceOf('docker run ghcr.io/acme/app:1.2').image).toBe('ghcr.io/acme/app:1.2');
  });

  test('--name sets the container name and the service name', () => {
    const result = convert('docker run --name my-web nginx');
    expect(result.serviceName).toBe('my-web');
    expect(result.compose.services['my-web']).toEqual({ image: 'nginx', container_name: 'my-web' });
  });

  test('--name=value form', () => {
    expect(serviceOf('docker run --name=db postgres').container_name).toBe('db');
  });

  test('a --name that is not a valid service name is sanitised and explained', () => {
    const result = convert('docker run --name "my app" nginx');
    expect(result.serviceName).toBe('my-app');
    expect(result.compose.services['my-app'].container_name).toBe('my app');
    expect(result.notes.join(' ')).toContain('The service is called "my-app"');
  });

  test('docker container run, sudo and a pasted prompt are accepted', () => {
    expect(serviceOf('docker container run nginx').image).toBe('nginx');
    expect(serviceOf('sudo docker run nginx').image).toBe('nginx');
    expect(serviceOf('$ docker run nginx').image).toBe('nginx');
  });

  test('-- ends the options', () => {
    expect(serviceOf('docker run -d -- nginx -g daemon').command).toEqual(['-g', 'daemon']);
  });
});

test.describe('flags', () => {
  test('-p / --publish in every spelling', () => {
    const service = serviceOf(
      'docker run -p 8080:80 -p9090:90 -p=7070:70 --publish 127.0.0.1:53:53/udp --publish=3000 nginx'
    );
    expect(service.ports).toEqual(['8080:80', '9090:90', '7070:70', '127.0.0.1:53:53/udp', '3000']);
  });

  test('-v with a bind mount, a named volume, an anonymous volume and a mode', () => {
    const result = convert(
      'docker run -v /srv/data:/data -v pgdata:/var/lib/postgresql/data -v /cache -v ./conf:/etc/app:ro nginx'
    );
    expect(result.compose.services.nginx.volumes).toEqual([
      '/srv/data:/data',
      'pgdata:/var/lib/postgresql/data',
      '/cache',
      './conf:/etc/app:ro',
    ]);
    // Only the named volume gets a top-level declaration.
    expect(result.compose.volumes).toEqual({ pgdata: {} });
    expect(result.notes.join(' ')).toContain('Named volumes are declared');
  });

  test('-v does not mistake a Windows drive path for a named volume', () => {
    const result = convert('docker run -v C:\\data:/data nginx');
    expect(result.compose.volumes).toBeUndefined();
    expect(result.compose.services.nginx.volumes).toEqual(['C:\\data:/data']);
  });

  test('-v with $(pwd) or $PWD becomes a path relative to the compose file', () => {
    for (const source of ['"$(pwd)"', '$PWD', '${PWD}']) {
      const result = convert(`docker run -v ${source}/site:/usr/share/nginx/html nginx`);
      expect(result.compose.services.nginx.volumes).toEqual(['./site:/usr/share/nginx/html']);
      expect(result.warnings).toEqual([]);
    }
    expect(serviceOf('docker run -v "$(pwd)":/app node').volumes).toEqual(['.:/app']);
  });

  test('--mount: a read-only bind mount', () => {
    const result = convert('docker run --mount type=bind,source=/srv/conf,target=/etc/conf,readonly nginx');
    expect(result.compose.services.nginx.volumes).toEqual([
      { type: 'bind', source: '/srv/conf', target: '/etc/conf', read_only: true },
    ]);
    expect(result.compose.volumes).toBeUndefined();
  });

  test('--mount: a named volume, with the short key spellings, is declared at the top level', () => {
    const result = convert('docker run --mount src=data,dst=/var/data,volume-nocopy nginx');
    expect(result.compose.services.nginx.volumes).toEqual([
      { type: 'volume', source: 'data', target: '/var/data', volume: { nocopy: true } },
    ]);
    expect(result.compose.volumes).toEqual({ data: {} });
  });

  test('--mount: tmpfs with a size, and bind propagation', () => {
    expect(serviceOf('docker run --mount type=tmpfs,target=/tmp,tmpfs-size=64m nginx').volumes).toEqual([
      { type: 'tmpfs', target: '/tmp', tmpfs: { size: '64m' } },
    ]);
    expect(
      serviceOf('docker run --mount type=bind,src=/mnt,target=/mnt,bind-propagation=rshared nginx').volumes
    ).toEqual([{ type: 'bind', source: '/mnt', target: '/mnt', bind: { propagation: 'rshared' } }]);
  });

  test('--mount: unsupported options, a missing target and an unknown type are warned about', () => {
    const options = convert('docker run --mount type=volume,source=v,target=/v,volume-opt=type=nfs nginx');
    expect(options.warnings.join(' ')).toContain('"volume-opt" option');
    expect(options.compose.services.nginx.volumes).toEqual([{ type: 'volume', source: 'v', target: '/v' }]);

    const noTarget = convert('docker run --mount type=bind,source=/a nginx');
    expect(noTarget.compose.services.nginx.volumes).toBeUndefined();
    expect(noTarget.warnings.join(' ')).toContain('has no target');

    const badType = convert('docker run --mount type=cluster,source=a,target=/a nginx');
    expect(badType.compose.services.nginx.volumes).toBeUndefined();
    expect(badType.warnings.join(' ')).toContain('mount type "cluster"');
  });

  test('-e / --env, with quoting and a bare name', () => {
    const service = serviceOf(
      `docker run -e A=1 -eB=2 --env C="three words" --env=D -e 'E=it is' -e "F=a=b" nginx`
    );
    expect(service.environment).toEqual(['A=1', 'B=2', 'C=three words', 'D', 'E=it is', 'F=a=b']);
  });

  test('--env-file may be repeated', () => {
    expect(serviceOf('docker run --env-file .env --env-file=./prod.env nginx').env_file).toEqual([
      '.env',
      './prod.env',
    ]);
  });

  test('--restart', () => {
    expect(serviceOf('docker run --restart unless-stopped nginx').restart).toBe('unless-stopped');
    expect(serviceOf('docker run --restart=on-failure:5 nginx').restart).toBe('on-failure:5');
    expect(serviceOf('docker run --restart no nginx').restart).toBe('no');
    const odd = convert('docker run --restart sometimes nginx');
    expect(odd.compose.services.nginx.restart).toBe('sometimes');
    expect(odd.warnings.join(' ')).toContain('not a restart policy');
  });

  test('--network: host, none, bridge and container: become network_mode', () => {
    for (const mode of ['host', 'none', 'bridge', 'container:db']) {
      const result = convert(`docker run --network ${mode} nginx`);
      expect(result.compose.services.nginx.network_mode).toBe(mode);
      expect(result.compose.services.nginx.networks).toBeUndefined();
      expect(result.compose.networks).toBeUndefined();
    }
    expect(serviceOf('docker run --net=host nginx').network_mode).toBe('host');
  });

  test('--network: a user-defined network gets a top-level declaration', () => {
    const result = convert('docker run --network backend nginx');
    expect(result.compose.services.nginx.networks).toEqual(['backend']);
    expect(result.compose.networks).toEqual({ backend: { external: true } });
    expect(result.notes.join(' ')).toContain('declared external');
  });

  test('--network: several networks keep their order', () => {
    const result = convert('docker run --network front --network back nginx');
    expect(result.compose.services.nginx.networks).toEqual(['front', 'back']);
    expect(Object.keys(result.compose.networks ?? {})).toEqual(['front', 'back']);
  });

  test('--network-alias and --ip go on the first user-defined network', () => {
    const result = convert(
      'docker run --network back --network-alias api --network-alias web --ip 10.0.0.5 nginx'
    );
    expect(result.compose.services.nginx.networks).toEqual({
      back: { aliases: ['api', 'web'], ipv4_address: '10.0.0.5' },
    });
  });

  test('--network-alias without a network attaches to the default network; --ip without one is warned about', () => {
    expect(serviceOf('docker run --net-alias api nginx').networks).toEqual({ default: { aliases: ['api'] } });
    const ip = convert('docker run --ip 10.0.0.5 nginx');
    expect(ip.compose.services.nginx.networks).toBeUndefined();
    expect(ip.warnings.join(' ')).toContain('--ip and --ip6 need a user-defined network');
  });

  test('--network with the comma-separated option form', () => {
    const result = convert('docker run --network name=back,alias=db,ip=10.1.0.9 nginx');
    expect(result.compose.services.nginx.networks).toEqual({
      back: { aliases: ['db'], ipv4_address: '10.1.0.9' },
    });
  });

  test('network_mode and a networks list cannot be combined, and the conflict is reported', () => {
    const result = convert('docker run --network host --network back nginx');
    expect(result.compose.services.nginx.network_mode).toBe('host');
    expect(result.compose.services.nginx.networks).toBeUndefined();
    expect(result.warnings.join(' ')).toContain('cannot combine network_mode');
    expect(result.compose.networks).toBeUndefined();
  });

  test('--hostname, -h, -u, -w, --domainname', () => {
    const service = serviceOf('docker run -h box --domainname example.org -u 1000:1000 -w /srv nginx');
    expect(service).toMatchObject({
      hostname: 'box',
      domainname: 'example.org',
      user: '1000:1000',
      working_dir: '/srv',
    });
    expect(serviceOf('docker run --hostname=h --user=app --workdir=/w nginx')).toMatchObject({
      hostname: 'h',
      user: 'app',
      working_dir: '/w',
    });
  });

  test('--entrypoint is a one-element list; an empty value resets it', () => {
    expect(serviceOf('docker run --entrypoint /bin/sh alpine -c "echo hi"')).toMatchObject({
      entrypoint: ['/bin/sh'],
      command: ['-c', 'echo hi'],
    });
    expect(serviceOf(`docker run --entrypoint "" alpine ls`).entrypoint).toEqual([]);
  });

  test('-i and -t, alone and combined', () => {
    expect(serviceOf('docker run -it ubuntu bash')).toMatchObject({ stdin_open: true, tty: true });
    expect(serviceOf('docker run -i ubuntu')).toMatchObject({ stdin_open: true });
    expect(serviceOf('docker run -i ubuntu').tty).toBeUndefined();
    expect(serviceOf('docker run --interactive --tty ubuntu')).toMatchObject({ stdin_open: true, tty: true });
  });

  test('combined short flags: -dit, and a value flag at the end of the cluster', () => {
    const result = convert('docker run -dit --name box ubuntu');
    expect(result.compose.services.box).toMatchObject({ stdin_open: true, tty: true });
    expect(result.notes.join(' ')).toContain('-d / --detach');

    expect(serviceOf('docker run -itp 8080:80 nginx')).toMatchObject({
      stdin_open: true,
      tty: true,
      ports: ['8080:80'],
    });
    expect(serviceOf('docker run -itp8080:80 nginx').ports).toEqual(['8080:80']);
    expect(serviceOf('docker run -tie A=1 nginx')).toMatchObject({ environment: ['A=1'], tty: true });
  });

  test('--privileged, and an explicit false', () => {
    expect(serviceOf('docker run --privileged nginx').privileged).toBe(true);
    expect(serviceOf('docker run --privileged=true nginx').privileged).toBe(true);
    expect(serviceOf('docker run --privileged=false nginx').privileged).toBeUndefined();
    const bad = convert('docker run --privileged=maybe nginx');
    expect(bad.compose.services.nginx.privileged).toBeUndefined();
    expect(bad.warnings.join(' ')).toContain('not a valid yes/no value');
  });

  test('--cap-add and --cap-drop', () => {
    const service = serviceOf('docker run --cap-add NET_ADMIN --cap-add=SYS_TIME --cap-drop ALL nginx');
    expect(service.cap_add).toEqual(['NET_ADMIN', 'SYS_TIME']);
    expect(service.cap_drop).toEqual(['ALL']);
  });

  test('-l / --label, including a label without a value', () => {
    const service = serviceOf(
      `docker run -l a=b --label "c=d e" --label=flag --label 'traefik.rule=Host(\`x.test\`)' nginx`
    );
    expect(service.labels).toEqual(['a=b', 'c=d e', 'flag=', 'traefik.rule=Host(`x.test`)']);
  });

  test('--add-host, --dns, --dns-search, --dns-option, --device', () => {
    const service = serviceOf(
      'docker run --add-host db:10.0.0.5 --add-host=host.docker.internal:host-gateway --dns 1.1.1.1 --dns 8.8.8.8 --dns-search example.org --dns-option ndots:2 --device /dev/ttyUSB0:/dev/ttyUSB0 nginx'
    );
    expect(service).toMatchObject({
      extra_hosts: ['db:10.0.0.5', 'host.docker.internal:host-gateway'],
      dns: ['1.1.1.1', '8.8.8.8'],
      dns_search: ['example.org'],
      dns_opt: ['ndots:2'],
      devices: ['/dev/ttyUSB0:/dev/ttyUSB0'],
    });
  });

  test('-m / --memory, --cpus and --shm-size', () => {
    const service = serviceOf('docker run -m 512m --cpus 1.5 --shm-size=256m nginx');
    expect(service).toMatchObject({ mem_limit: '512m', cpus: 1.5, shm_size: '256m' });
    expect(serviceOf('docker run --memory 1073741824 --shm-size 67108864 nginx')).toMatchObject({
      mem_limit: 1073741824,
      shm_size: 67108864,
    });
    expect(serviceOf('docker run --cpus=2 nginx').cpus).toBe(2);
  });

  test('--cpus rejects a value that is not a number', () => {
    const result = convert('docker run --cpus lots nginx');
    expect(result.compose.services.nginx.cpus).toBeUndefined();
    expect(result.warnings.join(' ')).toContain('"lots" is not a number');
  });

  test('--ulimit with soft and hard limits, a single limit, and a bad value', () => {
    const service = serviceOf('docker run --ulimit nofile=1024:2048 --ulimit nproc=65535 --ulimit memlock=-1:-1 nginx');
    expect(service.ulimits).toEqual({
      nofile: { soft: 1024, hard: 2048 },
      nproc: 65535,
      memlock: { soft: -1, hard: -1 },
    });
    const bad = convert('docker run --ulimit nofile nginx');
    expect(bad.compose.services.nginx.ulimits).toBeUndefined();
    expect(bad.warnings.join(' ')).toContain('expected name=soft or name=soft:hard');
  });

  test('--log-driver and --log-opt', () => {
    expect(
      serviceOf('docker run --log-driver json-file --log-opt max-size=10m --log-opt=max-file=3 nginx').logging
    ).toEqual({ driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } });
    expect(serviceOf('docker run --log-driver none nginx').logging).toEqual({ driver: 'none' });
    expect(serviceOf('docker run --log-opt max-size=1m nginx').logging).toEqual({
      options: { 'max-size': '1m' },
    });
    const bad = convert('docker run --log-opt max-size nginx');
    expect(bad.compose.services.nginx.logging).toBeUndefined();
    expect(bad.warnings.join(' ')).toContain('expected key=value');
  });

  test('--link keeps the value and explains what "links" means in Compose', () => {
    const result = convert('docker run --link db:database --link cache nginx');
    expect(result.compose.services.nginx.links).toEqual(['db:database', 'cache']);
    expect(result.notes.join(' ')).toContain('--link is a legacy feature');
  });

  test('health check flags', () => {
    const service = serviceOf(
      `docker run --health-cmd "curl -f http://localhost/ || exit 1" --health-interval 30s --health-timeout=5s --health-retries 3 --health-start-period 1m nginx`
    );
    expect(service.healthcheck).toEqual({
      test: ['CMD-SHELL', 'curl -f http://localhost/ || exit 1'],
      interval: '30s',
      timeout: '5s',
      retries: 3,
      start_period: '1m',
    });
  });

  test('--no-healthcheck and --health-cmd NONE disable the health check', () => {
    expect(serviceOf('docker run --no-healthcheck nginx').healthcheck).toEqual({ disable: true });
    expect(serviceOf('docker run --health-cmd NONE nginx').healthcheck).toEqual({ disable: true });
    expect(serviceOf('docker run --health-cmd true --no-healthcheck nginx').healthcheck).toEqual({
      disable: true,
    });
  });

  test('a health interval without a command is kept; non-numeric retries are warned about', () => {
    expect(serviceOf('docker run --health-interval 10s nginx').healthcheck).toEqual({ interval: '10s' });
    const bad = convert('docker run --health-retries many nginx');
    expect(bad.compose.services.nginx.healthcheck).toBeUndefined();
    expect(bad.warnings.join(' ')).toContain('expected a whole number');
  });

  test('other service settings map straight across', () => {
    const service = serviceOf(
      'docker run --init --read-only --pid host --ipc=host --security-opt no-new-privileges:true --sysctl net.core.somaxconn=1024 --tmpfs /run --group-add 44 --stop-signal SIGINT --stop-timeout 30 --pull always --platform linux/amd64 --expose 9000 --mac-address 02:42:ac:11:00:02 --pids-limit 100 --cpu-shares 512 --cpuset-cpus 0-1 --memory-swap -1 --oom-score-adj -500 nginx'
    );
    expect(service).toMatchObject({
      init: true,
      read_only: true,
      pid: 'host',
      ipc: 'host',
      security_opt: ['no-new-privileges:true'],
      sysctls: ['net.core.somaxconn=1024'],
      tmpfs: ['/run'],
      group_add: ['44'],
      stop_signal: 'SIGINT',
      stop_grace_period: '30s',
      pull_policy: 'always',
      platform: 'linux/amd64',
      expose: ['9000'],
      mac_address: '02:42:ac:11:00:02',
      pids_limit: 100,
      cpu_shares: 512,
      cpuset: '0-1',
      memswap_limit: -1,
      oom_score_adj: -500,
    });
  });

  test('--volumes-from refers to the container', () => {
    expect(serviceOf('docker run --volumes-from data:ro nginx').volumes_from).toEqual(['container:data:ro']);
  });

  test('--gpus', () => {
    const device = (extra: Record<string, unknown>) => ({
      resources: { reservations: { devices: [{ driver: 'nvidia', ...extra, capabilities: ['gpu'] }] } },
    });
    expect(serviceOf('docker run --gpus all nginx').deploy).toEqual(device({ count: 'all' }));
    expect(serviceOf('docker run --gpus 2 nginx').deploy).toEqual(device({ count: 2 }));
    expect(serviceOf(`docker run --gpus '"device=0,1"' nginx`).deploy).toEqual(
      device({ device_ids: ['0', '1'] })
    );
    expect(convert('docker run --gpus banana nginx').warnings.join(' ')).toContain('only "all", a count');
  });

  test('--storage-opt', () => {
    expect(serviceOf('docker run --storage-opt size=10G nginx').storage_opt).toEqual({ size: '10G' });
  });
});

test.describe('notes and warnings', () => {
  test('-d and --rm are explained in notes and do not appear in the service', () => {
    const result = convert('docker run -d --rm --name job busybox');
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0]).toContain('docker compose up -d');
    expect(result.notes[1]).toContain('--rm has no Compose equivalent');
    expect(result.warnings).toEqual([]);
    expect(result.compose.services.job).toEqual({ image: 'busybox', container_name: 'job' });
  });

  test('a note is not repeated when its flag is', () => {
    expect(convert('docker run -d --detach nginx').notes).toHaveLength(1);
  });

  test('flags that are not understood are listed as warnings', () => {
    const result = convert('docker run --frobnicate=yes -Z --name x nginx');
    expect(result.warnings).toEqual([
      'Unknown option `--frobnicate` was not converted.',
      'Unknown option `-Z` was not converted.',
    ]);
    expect(result.compose.services.x.image).toBe('nginx');
  });

  test('an unknown flag without = warns that its value may be mistaken for the image', () => {
    const result = convert('docker run --frobnicate value nginx');
    expect(result.warnings[0]).toContain('"value" may be mistaken for the image name');
    // The unknown flag cannot be told from a switch, so "value" is read as the image, as docker would for a switch.
    expect(result.compose.services.value.image).toBe('value');
    expect(result.compose.services.value.command).toEqual(['nginx']);
  });

  test('flags Docker has but Compose cannot express are warned about with a reason', () => {
    const result = convert('docker run -P --label-file labels.txt --cpuset-mems 0 --blkio-weight 300 nginx');
    expect(result.warnings).toHaveLength(4);
    expect(result.warnings[0]).toContain('`-P` was not converted');
    expect(result.warnings[1]).toContain('`--label-file labels.txt` was not converted');
    expect(result.warnings[2]).toContain('`--cpuset-mems 0`');
    expect(result.warnings[3]).toContain('blkio_config');
    expect(result.compose.services.nginx).toEqual({ image: 'nginx' });
  });

  test('harmless flags with no Compose setting go to the notes', () => {
    const result = convert('docker run --sig-proxy=false -q --disable-content-trust --detach-keys ctrl-x -a stdout nginx');
    expect(result.notes).toHaveLength(5);
    expect(result.warnings).toEqual([]);
  });

  test('a switch that is already the default is not worth a note', () => {
    expect(convert('docker run --sig-proxy nginx').notes).toEqual([]);
    expect(convert('docker run --rm=false nginx').notes).toEqual([]);
  });

  test('a flag that is missing its value is reported', () => {
    const result = convert('docker run nginx -p 80:80');
    // After the image everything is the command...
    expect(result.warnings).toEqual([]);
    expect(result.compose.services.nginx.command).toEqual(['-p', '80:80']);

    const missing = convertDockerRun('docker run --name');
    expect(missing).toEqual({ ok: false, error: 'No image name found after the options.' });
  });

  test('an empty value is skipped with a warning', () => {
    const result = convert('docker run --hostname "" nginx');
    expect(result.compose.services.nginx.hostname).toBeUndefined();
    expect(result.warnings[0]).toContain('has an empty value');
  });

  test('a second command is ignored and reported', () => {
    const result = convert('docker run -d nginx && docker logs nginx');
    expect(result.compose.services.nginx).toEqual({ image: 'nginx' });
    expect(result.warnings).toEqual([
      'Only the first command was converted. This text after it was ignored: && docker logs nginx',
    ]);
  });

  test('an environment prefix before the command is reported', () => {
    const result = convert('DOCKER_HOST=tcp://box:2375 docker run nginx');
    expect(result.warnings[0]).toContain('DOCKER_HOST=tcp://box:2375');
  });

  test('command substitution is warned about; plain variables are explained', () => {
    const substitution = convert('docker run -e STAMP=$(date +%s) nginx');
    expect(substitution.warnings.join(' ')).toContain('command substitution');

    const variable = convert('docker run -e HOME_DIR=$HOME -p ${PORT}:80 nginx');
    expect(variable.warnings).toEqual([]);
    expect(variable.compose.services.nginx.environment).toEqual(['HOME_DIR=$HOME']);
    expect(variable.compose.services.nginx.ports).toEqual(['${PORT}:80']);
    expect(variable.notes.join(' ')).toContain('filled in by Compose');
  });

  test('a single-quoted dollar sign is written as $$ so Compose does not read it as a variable', () => {
    const result = convert(`docker run alpine sh -c 'echo $HOME'`);
    expect(result.compose.services.alpine.command).toEqual(['sh', '-c', 'echo $$HOME']);
    expect(result.notes.join(' ')).toContain('written as $$');
    expect(result.warnings).toEqual([]);
  });
});

test.describe('a realistic command', () => {
  const NEXTCLOUD = `docker run -d \\
  --name nextcloud \\
  --restart unless-stopped \\
  -p 8080:80 \\
  -v nextcloud_data:/var/www/html \\
  -v /srv/nextcloud/config:/var/www/html/config:ro \\
  -e MYSQL_HOST=db \\
  -e "MYSQL_PASSWORD=s3cr3t pass" \\
  --env-file ./nextcloud.env \\
  --network proxy \\
  --hostname cloud.example.com \\
  -l traefik.enable=true \\
  --label 'traefik.http.routers.nc.rule=Host(\`cloud.example.com\`)' \\
  --memory 2g --cpus 1.5 \\
  --health-cmd "curl -f http://localhost/status.php || exit 1" \\
  --health-interval 30s --health-timeout 10s --health-retries 3 \\
  --log-driver json-file --log-opt max-size=10m --log-opt max-file=3 \\
  --ulimit nofile=65536:65536 \\
  --cap-add NET_ADMIN --dns 1.1.1.1 --add-host db:10.0.0.5 \\
  nextcloud:29-apache apache2-foreground`;

  test('every flag is converted and nothing is dropped', () => {
    const result = convert(NEXTCLOUD);
    expect(result.serviceName).toBe('nextcloud');
    expect(result.warnings).toEqual([]);
    expect(result.compose).toEqual({
      services: {
        nextcloud: {
          image: 'nextcloud:29-apache',
          container_name: 'nextcloud',
          hostname: 'cloud.example.com',
          command: ['apache2-foreground'],
          restart: 'unless-stopped',
          ports: ['8080:80'],
          volumes: ['nextcloud_data:/var/www/html', '/srv/nextcloud/config:/var/www/html/config:ro'],
          environment: ['MYSQL_HOST=db', 'MYSQL_PASSWORD=s3cr3t pass'],
          env_file: ['./nextcloud.env'],
          labels: ['traefik.enable=true', 'traefik.http.routers.nc.rule=Host(`cloud.example.com`)'],
          networks: ['proxy'],
          extra_hosts: ['db:10.0.0.5'],
          dns: ['1.1.1.1'],
          cap_add: ['NET_ADMIN'],
          mem_limit: '2g',
          cpus: 1.5,
          ulimits: { nofile: { soft: 65536, hard: 65536 } },
          logging: { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } },
          healthcheck: {
            test: ['CMD-SHELL', 'curl -f http://localhost/status.php || exit 1'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
          },
        },
      },
      volumes: { nextcloud_data: {} },
      networks: { proxy: { external: true } },
    });
    // -d, named volume and external network each get a note.
    expect(result.notes).toHaveLength(3);
  });

  test('the service keys come out in a readable order', () => {
    const result = convert(NEXTCLOUD);
    expect(Object.keys(result.compose.services.nextcloud)).toEqual([
      'image',
      'container_name',
      'hostname',
      'command',
      'restart',
      'ports',
      'volumes',
      'environment',
      'env_file',
      'labels',
      'networks',
      'extra_hosts',
      'dns',
      'cap_add',
      'mem_limit',
      'cpus',
      'ulimits',
      'logging',
      'healthcheck',
    ]);
  });

  test('the bundled example converts without warnings', () => {
    const result = convert(EXAMPLE_DOCKER_RUN);
    expect(result.warnings).toEqual([]);
    expect(result.serviceName).toBe('web');
    expect(result.compose.volumes).toEqual({ web_data: {} });
  });
});

test.describe('YAML output', () => {
  test('matches the layout of a hand-written compose file', () => {
    const result = convert(
      'docker run -d --name web --restart no -p 8080:80 -e TZ=UTC -v data:/data --network backend --memory 512m nginx:1.27'
    );
    expect(dump(result.compose, COMPOSE_YAML_OPTIONS)).toBe(
      [
        'services:',
        '  web:',
        '    image: nginx:1.27',
        '    container_name: web',
        '    restart: "no"',
        '    ports:',
        '      - "8080:80"',
        '    volumes:',
        '      - data:/data',
        '    environment:',
        '      - TZ=UTC',
        '    networks:',
        '      - backend',
        '    mem_limit: 512m',
        'volumes:',
        '  data: {}',
        'networks:',
        '  backend:',
        '    external: true',
        '',
      ].join('\n')
    );
  });

  test('values that YAML could misread are quoted, so loading the file gives the same data back', () => {
    const result = convert(
      `docker run --restart no -p 80:80 -p 22:22 -u 1000:1000 --expose 8000 --log-opt max-file=3 --entrypoint "" -e DEBUG=true -e "EMPTY=" --label yes=on --stop-timeout 10 alpine true false 1 null`
    );
    expect(load(dump(result.compose, COMPOSE_YAML_OPTIONS))).toEqual(result.compose);
  });

  test('the realistic examples survive a YAML round trip', () => {
    for (const command of [EXAMPLE_DOCKER_RUN, 'docker run -dit -p 80:80/tcp --mount type=bind,src=/a,dst=/b,ro nginx']) {
      const result = convert(command);
      expect(load(dump(result.compose, COMPOSE_YAML_OPTIONS))).toEqual(result.compose);
    }
  });

  test('long values are not folded across lines', () => {
    const long = 'x'.repeat(200);
    const result = convert(`docker run -e LONG=${long} nginx`);
    expect(dump(result.compose, COMPOSE_YAML_OPTIONS)).toContain(`- LONG=${long}\n`);
  });
});

test.describe('input that is not a docker run command', () => {
  const rejected = (input: string) => {
    const result = convertDockerRun(input);
    if (result.ok) throw new Error(`expected a rejection for: ${input}`);
    return result.error;
  };

  test('empty and blank input', () => {
    expect(rejected('')).toBe('Paste a docker run command to convert it.');
    expect(rejected('  \n  ')).toBe('Paste a docker run command to convert it.');
  });

  test('other commands', () => {
    const message = 'This does not look like a docker run command. It should start with "docker run".';
    expect(rejected('ls -la')).toBe(message);
    expect(rejected('curl https://example.com')).toBe(message);
    expect(rejected('hello world')).toBe(message);
    expect(rejected('run -d nginx')).toBe(message);
    expect(rejected('-d --name x nginx')).toBe(message);
  });

  test('other docker commands', () => {
    expect(rejected('docker ps -a')).toBe('Only "docker run" can be converted, but this command is "docker ps".');
    expect(rejected('docker compose up -d')).toBe(
      'Only "docker run" can be converted, but this command is "docker compose".'
    );
    expect(rejected('docker')).toBe('This does not look like a docker run command. It should start with "docker run".');
  });

  test('docker run with no image', () => {
    expect(rejected('docker run')).toBe('No image name found after the options.');
    expect(rejected('docker run -d --rm')).toBe('No image name found after the options.');
  });

  test('options on lines without a backslash are explained', () => {
    expect(rejected('docker run -d\n  --name web\n  nginx')).toBe(
      'No image name found after the options. A line break ends the command unless the line ends with a backslash (\\), so options on later lines were not read.'
    );
  });

  test('unbalanced quotes give a tokenizer error instead of throwing', () => {
    expect(rejected(`docker run -e "A=b nginx`)).toBe('Unterminated double quote (").');
    expect(rejected(`docker run -e 'A=b nginx`)).toBe("Unterminated single quote (').");
  });

  test('never throws on odd input', () => {
    for (const input of ['\\', '"', "'", '$', '$(', '${', '-', '--', 'docker run --', 'docker run -p', '```', '\u0000', 'docker run \\']) {
      expect(() => convertDockerRun(input)).not.toThrow();
    }
  });
});
