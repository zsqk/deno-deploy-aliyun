import { assertEquals } from 'https://deno.land/std@0.167.0/testing/asserts.ts';
import { parseGitRepo } from './deploy.ts';

/**
 * 测试从 GitRepo 中解析仓库地址和分支名称
 *
 * @author kouler <zk@go0356.com>
 */
Deno.test('testGetBranchName', () => {
  const url1 = 'https://github.com/zsqk/Zsqk.git';
  const res1 = parseGitRepo(url1);
  assertEquals(res1, { repo: url1, branch: undefined });

  const url2 = 'https://github.com/zsqk/Zsqk.git#branch-name';
  const res2 = parseGitRepo(url2);
  assertEquals(res2, {
    repo: 'https://github.com/zsqk/Zsqk.git',
    branch: 'branch-name',
  });

  const url3 = 'https://user:p#w#@github.com/zsqk/Zsqk.git#branch-name';
  const res3 = parseGitRepo(url3);
  assertEquals(res3, {
    repo: 'https://user:p#w#@github.com/zsqk/Zsqk.git',
    branch: 'branch-name',
  });
});
