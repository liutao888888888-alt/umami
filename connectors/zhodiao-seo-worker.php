<?php
// Install outside public_html, at /home/u140434214/umami-seo-worker.php.
if(PHP_SAPI!=='cli')exit(1);
define('DOING_CRON',true);
require __DIR__.'/domains/zhodiao.com/public_html/wp-load.php';
if(!class_exists('Zhodiao_Umami_SEO'))exit(1);
$deadline=microtime(true)+40;
for($i=0;$i<5&&microtime(true)<$deadline;$i++){
 $s=Zhodiao_Umami_SEO::state();
 if(!$s['running'])break;
 $remaining=count($s['queue']);
 $result=Zhodiao_Umami_SEO::run();
 if(is_wp_error($result)||count(Zhodiao_Umami_SEO::state()['queue'])===$remaining)break;
}
