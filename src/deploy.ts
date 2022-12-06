import { stringify as yamlStringify } from 'https://deno.land/std@0.144.0/encoding/yaml.ts';
import { YamlConfig, YamlConfigFunction } from './s.type.ts';

type GitRepo = string;
type FilePath = string;

// TODO: 检查 s 版本
// TODO: perf 单一仓库性能优化, 如果仓库完全一致, 则不要重复拉取.
// TODO: perf 识别单一代码, 仅进行多地部署, 不进行重复编译.

// TODO: 将 importMapFile 改为 deno config 文件.

// TODO: 补充注释
// https://docs.serverless-devs.com/fc/yaml/function
export interface Config {
  /** 配置昵称 */
  name: string;
  access: {
    accessKeyID: string;
    accessKeySecret: string;
    accountID: string;
  };
  functions: Array<{
    /** 函数标签, 用于标明该函数身份, 比如 ['test', 'z1'] */
    tags: string[];
    /** [构建] Git 仓库地址 */
    gitRepo: GitRepo;
    /** [构建] deno 主文件地址 */
    mainFile: FilePath;
    /** [构建] deno import map 地址 */
    importMapFile: FilePath;
    /** [构建] 构建时环境变量 */
    buildEnv?: Record<string, string>;
    // TODO: 检查 deno 版本
    /** [构建] 构建时 deno 的版本, 但更好的是当 deno 支持时放入 config 文件中 */
    // denoVersion?: string;
    /** [上传] 阿里云地区 */
    ALIYUN_REGION: string;
    /** [上传] 阿里云函数计算服务名称 */
    ALIYUN_FC_S_NAME: string;
    /** [上传] 阿里云函数计算函数名称 */
    ALIYUN_FC_F_NAME: string;
    /** [运行] 运行时环境变量 */
    env: Array<[string, string]>;
    /** [运行] 实例并发数 */
    instanceConcurrency: number;
    /**
     * [运行] vCPU
     * - 最小 0.05
     * - 最大 32
     * - 步长 0.05
     * - vCPU 大小（核）与内存大小（GB）的比值必须在 1:1 到 1:4 之间
     */
    cpu?: number;
    /** [运行] 磁盘, 单位 MB, 目前只有 512 和 10240 可选, 512 免费 */
    diskSize?: 512 | 10240;
    /**
     * [运行] 内存, 单位 MB
     * - 最小 128
     * - 最大 32768
     * - 步长 64
     * - vCPU 大小（核）与内存大小（GB）的比值必须在 1:1 到 1:4 之间
     */
    memorySize: number;
    /** [运行] 超时时间, 单位 秒 */
    timeout: number;
    /** [运行] 函数计算监听端口 */
    caPort?: number;
  }>;
}

/**
 * 从 GitRepo 中解析仓库地址和分支名称
 *
 * 未指定分支名称时 branch 的值为 undefined
 *
 * @author kouler <zk@go0356.com>
 */
export function parseGitRepo(url: GitRepo): {
  repo: string;
  branch: string | undefined;
} {
  const res = url.split('.git#');
  if (res.length === 1) {
    return { repo: url, branch: undefined };
  }
  return { repo: res[0] + '.git', branch: res[1] };
}

/**
 * 部署 Deno 项目到阿里云函数计算
 * @author Lian Zheren <lzr@zsqk.com.cn>
 */
export async function deploy(config: Config) {
  /** s 工具密钥昵称 */
  const accessName = 'denodeploy';
  // 配置 s 密钥信息
  const p = Deno.run({
    cmd: [
      's',
      'config',
      'add',
      '-f',
      '--AccessKeyID',
      config.access.accessKeyID,
      '--AccessKeySecret',
      config.access.accessKeySecret,
      '--AccountID',
      config.access.accountID,
      '--access',
      accessName,
    ],
  });
  const s = await p.status();
  p.close();
  if (!s.success) {
    throw new Error(`初始化 s 密钥失败, code ${s.code}`);
  }

  for (const f of config.functions) {
    // 创建临时目录
    const tempPath = Deno.makeTempDirSync();
    console.log('tempPath', tempPath);
    Deno.chdir(tempPath);

    // s.yaml 模板 函数部分 处理
    const functionYaml: YamlConfigFunction = {
      name: f.ALIYUN_FC_F_NAME,
      environmentVariables: Object.fromEntries(
        f.env.filter(([_k, v]) => Boolean(v)),
      ),
      instanceConcurrency: f.instanceConcurrency,
      instanceType: 'e1',
      memorySize: f.memorySize,
      runtime: 'custom',
      timeout: f.timeout,
      codeUri: './dist',
    };

    // 处理可选配置
    if (f.caPort !== undefined) {
      functionYaml.caPort = f.caPort;
    }
    if (f.cpu !== undefined) {
      functionYaml.cpu = f.cpu;
    }
    if (f.diskSize !== undefined) {
      functionYaml.diskSize = f.diskSize;
    }

    // 处理环境变量, 准备放入 s.yaml 模板
    if (functionYaml.environmentVariables['DENO_DIR'] === undefined) {
      functionYaml.environmentVariables['DENO_DIR'] = '/tmp/deno_dir';
    }
    if (functionYaml.environmentVariables['TZ'] === undefined) {
      functionYaml.environmentVariables['TZ'] = 'Asia/Shanghai';
    }

    // s.yaml 模板处理
    const c: YamlConfig = {
      edition: '1.0.0',
      name: config.name,
      access: accessName,
      services: {
        [`fc-${f.ALIYUN_FC_F_NAME}`]: {
          component: 'devsapp/fc',
          props: {
            region: f.ALIYUN_REGION,
            service: { name: f.ALIYUN_FC_S_NAME },
            function: functionYaml,
          },
        },
      },
    };

    // 将配置写为 s 工具需要的 yaml
    Deno.writeTextFileSync(`${tempPath}/s.yml`, yamlStringify({ ...c }));

    // git 拉取代码
    {
      let command: Array<string> = [];
      const { repo, branch } = parseGitRepo(f.gitRepo);
      if (branch) {
        command = ['git', 'clone', repo, '--depth', '1', '-b', branch];
      } else {
        command = ['git', 'clone', repo, '--depth', '1'];
      }

      const r = Deno.run({
        cmd: command,
        cwd: tempPath,
      });
      const rs = await r.status();
      r.close();
      if (!rs.success) {
        throw new Error(`git 拉取失败, code ${rs.code}`);
      }
    }

    {
      // 强制更新 deno 依赖的缓存
      const r = Deno.run({
        cmd: [
          `deno`,
          'cache',
          '-r',
          `--import-map=${f.importMapFile}`,
          f.mainFile,
        ],
        cwd: tempPath,
        env: f.buildEnv,
      });
      await r.status();
      r.close();
    }

    // 构建 deno 文件
    await buildDenoForAliyun({
      dirPath: tempPath,
      mainFile: f.mainFile,
      importMapFile: f.importMapFile,
      env: f.buildEnv,
    });

    // 准备上传
    const r2 = Deno.run({
      cmd: ['s', 'deploy', 'function', '--use-local'],
      cwd: tempPath,
    });
    await r2.status();
    r2.close();
  }
}

/**
 * 构建 deno 文件 (为阿里云)
 *
 * 功能点:
 *
 * 1. 编译为 Linux 下可执行文件.
 * 2. 默认完全 check.
 *
 * @author Lian Zheren <lzr@zsqk.com.cn>
 */
async function buildDenoForAliyun(
  { dirPath, mainFile, importMapFile, packName = 'sef', env }: {
    /** 目录地址, 最后不包含 `/` */
    dirPath: string;
    /** deno 主文件相对地址 */
    mainFile: string;
    /** deno map 文件相对地址 */
    importMapFile: string;
    /** 生成的包名, Single Executable File */
    packName?: string;
    env?: Record<string, string>;
  },
) {
  // 构建 deno 文件
  const r = Deno.run({
    cmd: [
      `deno`,
      'compile',
      '--check=all',
      '--output',
      `dist/bin/${packName}`,
      '--target',
      'x86_64-unknown-linux-gnu',
      '--allow-all',
      `--import-map=${importMapFile}`,
      mainFile,
    ],
    cwd: dirPath,
    env,
  });
  const s = await r.status();
  r.close();
  if (!s.success) {
    throw new Error('deno 可执行文件构建失败');
  }
  Deno.writeTextFileSync(
    `${dirPath}/dist/bootstrap`,
    `#!/bin/bash\n./bin/${packName} --allow-all`,
  );
}
