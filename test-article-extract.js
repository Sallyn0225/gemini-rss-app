#!/usr/bin/env node

/**
 * 测试文章提取 API
 *
 * 使用方法：
 * node test-article-extract.js <article-url>
 *
 * 示例：
 * node test-article-extract.js https://sspai.com/post/106570
 */

const testUrl = process.argv[2];

if (!testUrl) {
  console.error('请提供文章 URL');
  console.error('使用方法: node test-article-extract.js <article-url>');
  process.exit(1);
}

const apiUrl = `http://localhost:3000/api/article/extract?url=${encodeURIComponent(testUrl)}`;

console.log('测试文章提取 API...');
console.log('文章 URL:', testUrl);
console.log('API URL:', apiUrl);
console.log('');

fetch(apiUrl)
  .then(response => {
    console.log('HTTP 状态:', response.status);
    console.log('');
    return response.json();
  })
  .then(data => {
    console.log('响应数据:');
    console.log(JSON.stringify(data, null, 2));
    console.log('');

    if (data.success && data.data) {
      console.log('✅ 提取成功！');
      console.log('标题:', data.data.title);
      console.log('作者:', data.data.byline);
      console.log('网站:', data.data.siteName);
      console.log('摘要:', data.data.excerpt.substring(0, 100) + '...');
      console.log('内容长度:', data.data.length, '字符');
      console.log('HTML 长度:', data.data.content.length, '字节');
    } else {
      console.log('❌ 提取失败');
      console.log('错误:', data.error);
      console.log('降级策略:', data.fallback);
    }
  })
  .catch(error => {
    console.error('❌ 请求失败:', error.message);
    process.exit(1);
  });
