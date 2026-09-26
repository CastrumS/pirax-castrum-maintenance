<?php
// Test-only extension of the native plugin harness. Never packaged or installed on a live site.
add_action('wp_footer', static function () { echo '<span hidden data-forms-fixture="native-v1"></span>'; });
add_filter('gform_form_args', static function ($args) {
    if ((int) $args['form_id'] === (int) get_option('pirax_checker_ajax')) $args['submission_method'] = 'ajax';
    return $args;
});
// Native field validation remains authoritative; a required field is rendered as optional only
// for this disposable server-rejection fixture, so the browser reaches GF's actual required rule.
add_filter('gform_pre_render', static function ($form) {
    if ((int) $form['id'] === (int) get_option('pirax_checker_server')) {
        foreach ($form['fields'] as $field) if ((int) $field->id === 4) $field->isRequired = false;
    }
    return $form;
});
add_filter('gform_field_content', static function ($html, $field, $value, $entry, $form_id) {
    if ((int) $form_id === (int) get_option('pirax_checker_client') && (int) $field->id === 4)
        $html = str_replace('<input ', '<input required style="display:none" ', $html);
    return $html;
}, 10, 5);

function pirax_checker_seed($base_gf, $ff) {
    wp_set_current_user(1);
    $make = static function ($name, $fields) use ($base_gf) {
        $form = GFAPI::get_form($base_gf);
        unset($form['id']);
        $form['title'] = "Checker $name";
        $form['fields'] = $fields;
        $id = GFAPI::add_form($form);
        if (is_wp_error($id)) throw new RuntimeException('Native GF fixture creation failed');
        return (int) $id;
    };
    $basic = [
        ['id'=>1, 'type'=>'text', 'label'=>'Name', 'isRequired'=>true],
        ['id'=>2, 'type'=>'email', 'label'=>'Email', 'isRequired'=>true],
        ['id'=>3, 'type'=>'textarea', 'label'=>'Message'],
    ];
    $ids = ['gf'=>$base_gf, 'ff'=>$ff, 'ajax'=>$make('ajax', $basic)];
    $ids['upload'] = $make('upload', array_merge($basic, [['id'=>4,'type'=>'fileupload','label'=>'Attachment']]));
    $ids['nomarker'] = $make('nomarker', [['id'=>2,'type'=>'email','label'=>'Email','isRequired'=>true]]);
    // GF uses a native required checkbox rule. Optional unchecked boxes are deliberately not guessed.
    $checkbox = ['id'=>4,'type'=>'checkbox','label'=>'Required consent','isRequired'=>true,
        'choices'=>[['text'=>'Consent','value'=>'yes','isSelected'=>false]],
        'inputs'=>[['id'=>'4.1','label'=>'Consent','name'=>'']]];
    $ids['server'] = $make('server', array_merge($basic, [$checkbox]));
    // A hidden-by-CSS but enabled required input is not filled; HTML validity rejects it before POST.
    $ids['client'] = $make('client', array_merge($basic, [['id'=>4,'type'=>'text','label'=>'Required client input','isRequired'=>true]]));
    update_option('pirax_checker_ajax', $ids['ajax']);
    update_option('pirax_checker_server', $ids['server']);
    update_option('pirax_checker_client', $ids['client']);
    $gf = static fn($id) => '[gravityform id="'.$id.'" title="false" ajax="false"]';
    $ff_code = '[fluentform id="'.$ff.'"]';
    $contents = [
        'primary'=>$gf($base_gf)."\n\n".$ff_code,
        'ajax'=>$gf($ids['ajax'])."\n\n".$ff_code,
        'negative'=>$gf($ids['upload']).$gf($ids['nomarker']).$gf($ids['client']).$gf($ids['server']).$ff_code,
    ];
    $pages = [];
    foreach ($contents as $name=>$content) {
        $id = wp_insert_post(['post_type'=>'page','post_status'=>'publish','post_name'=>'checker-'.$name,'post_title'=>'Checker '.$name,'post_content'=>$content], true);
        if (is_wp_error($id) || get_post_field('post_content', $id, 'raw') !== $content) throw new RuntimeException('Native page fixture readback mismatch');
        $pages[$name] = get_permalink($id);
    }
    return ['ids'=>$ids, 'pages'=>$pages];
}
