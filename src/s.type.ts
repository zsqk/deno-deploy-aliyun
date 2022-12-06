// s 工具的相关类型

/**
 *  https://docs.serverless-devs.com/fc/yaml/readme
 */
export interface YamlConfig {
  /** 命令行YAML规范版本，遵循语义化版本（Semantic Versioning）规范 */
  edition: '1.0.0';
  /** 项目名称 */
  name: string;
  /** 秘钥别名 */
  access: string;
  services: Record<string, {
    component: 'devsapp/fc';
    props: {
      region: string;
      service: { name: string };
      function: YamlConfigFunction;
    };
  }>;
}

/**
 * https://docs.serverless-devs.com/fc/yaml/function
 */
export interface YamlConfigFunction {
  name: string;
  environmentVariables: Record<string, string | number>;
  handler?: string;
  instanceConcurrency: number;
  instanceType: 'e1' | 'c1';
  cpu?: number;
  diskSize?: number;
  memorySize: number;
  runtime: 'custom';
  caPort?: number;
  timeout: number;
  codeUri: string;
}
