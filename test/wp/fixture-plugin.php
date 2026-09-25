<?php
/** Plugin Name: Visual selftest fixture (disposable Playground only) */
add_action('init', function () {
    if (defined('WP_CLI') && WP_CLI) return;
    $file = '/tmp/visual-counts.json';
    $counts = file_exists($file) ? json_decode(file_get_contents($file), true) : [];
    $method = $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN';
    $counts[$method] = ($counts[$method] ?? 0) + 1;
    file_put_contents($file, json_encode($counts));
});
add_action('template_redirect', function () {
    $slug = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
    $state = json_decode(get_option('visual_fixture', '{}'), true) ?: [];
    $mode = $state[$slug] ?? 'normal';
    if (str_starts_with($slug, 'missing-')) {
        status_header(404); header('Content-Type: text/plain'); echo 'fixture missing'; exit;
    }
    $post = get_page_by_path($slug, OBJECT, 'page');
    status_header($mode === 'forbidden' ? 403 : ($mode === 'notfound' || !$post ? 404 : 200));
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Fixture</title>';
    echo '<style>body{margin:0;font:24px Arial;background:#fafafa;color:#17324d}main{padding:32px;min-height:960px}h1{font-size:40px}article{padding:24px;background:#d5e7f8;min-height:300px}.random{height:280px;width:100%}</style></head><body data-visual-fixture="true"><main>';
    echo '<h1>' . esc_html($post ? $post->post_title : 'Not found') . '</h1><article>';
    // Actual WordPress post content: WP-CLI changes are visible on this same database.
    echo $post ? $post->post_content : 'Missing page';
    echo '</article><p>Ordinary Cloudflare CAPTCHA documentation</p>';
    if ($mode === 'critical') echo '<p>There has been a critical error on this website.</p>';
    if ($mode === 'challenge') echo '<script>window._cf_chl_opt={};</script><p>Challenge</p>';
    if (str_starts_with($mode, 'assets')) {
        echo '<img width="80" height="80" src="/missing-' . esc_attr($mode) . '.png"><link rel="stylesheet" href="/missing-' . esc_attr($mode) . '.css">';
    }
    if (str_starts_with($mode, 'console')) {
        echo '<script>console.error(' . wp_json_encode($mode) . ');setTimeout(()=>{throw new Error(' . wp_json_encode($mode . ' uncaught') . ')},20)</script>';
    }
    if ($mode === 'random') echo '<div id="random" class="random"></div><div id="random-page" class="random"></div><script>for(const e of document.querySelectorAll(".random")){e.textContent=String(crypto.getRandomValues(new Uint32Array(1))[0]);const colors=Array.from({length:12},()=>"rgb("+[...crypto.getRandomValues(new Uint8Array(3))].join(",")+")");e.style.background="linear-gradient(90deg,"+colors.join(",")+")"}</script>';
    if ($mode === 'tall') echo '<div style="height:1700px;background:#acf">More height</div>';
    if ($mode === 'overflow') echo '<div style="width:1800px;height:200px;background:#acf">Wide content</div>';
    if ($mode === 'writes') echo '<script>fetch("/write/",{method:"POST",body:"test"}).catch(()=>{});navigator.sendBeacon("/beacon/","test")</script>';
    if (str_starts_with($mode, 'transport:')) echo '<script src="http://127.0.0.1:' . intval(substr($mode, 10)) . '/unreachable.js"></script>';
    echo '</main></body></html>'; exit;
}, -100);
