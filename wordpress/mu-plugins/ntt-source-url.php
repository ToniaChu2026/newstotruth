<?php
/**
 * Plugin Name: NewsToTruth Source URL
 * Description: 讓 AI 匯入工具能在文章上記錄來源網址（source_url），並支援透過 REST API 以來源網址查重。
 * Version:     1.0.0
 *
 * 安裝：把這個檔案放到 wp-content/mu-plugins/ntt-source-url.php（沒有 mu-plugins 資料夾就建立一個）。
 * mu-plugins 會自動啟用，不需要在後台啟用。
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'init', function () {
	register_post_meta( 'post', 'source_url', array(
		'type'          => 'string',
		'single'        => true,
		'show_in_rest'  => true,
		'auth_callback' => function () {
			return current_user_can( 'edit_posts' );
		},
		'sanitize_callback' => 'esc_url_raw',
	) );
} );

// 讓 GET /wp-json/wp/v2/posts?source_url=... 只回傳相同來源網址的文章。
add_filter( 'rest_post_query', function ( $args, $request ) {
	$source_url = $request->get_param( 'source_url' );
	if ( is_string( $source_url ) && $source_url !== '' ) {
		$args['meta_query'] = array(
			array(
				'key'     => 'source_url',
				'value'   => esc_url_raw( $source_url ),
				'compare' => '=',
			),
		);
	}
	return $args;
}, 10, 2 );

// 在文章編輯畫面側欄顯示來源網址，方便編輯核對。
add_action( 'add_meta_boxes', function () {
	add_meta_box( 'ntt-source-url', '來源網址', function ( $post ) {
		$url = get_post_meta( $post->ID, 'source_url', true );
		echo $url ? '<a href="' . esc_url( $url ) . '" target="_blank" rel="noopener">' . esc_html( $url ) . '</a>' : '<em>（非 AI 匯入）</em>';
	}, 'post', 'side', 'low' );
} );
