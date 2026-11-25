<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * API-63 共同編集のチャンネルの認可（F-35、D-119）。pusher-js が渡す接続の番号とチャンネル名を受け取る。
 */
class RealtimeAuthRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * 画面には入力欄がなく、どちらも pusher-js が作る値なので、形だけを確かめる。
     * リストを使える人かどうかは、チャンネルの認可（AppServiceProvider）で確かめる。
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'socket_id' => ['bail', 'required', 'string', 'regex:/\A\d+\.\d+\z/'],
            'channel_name' => ['bail', 'required', 'string', 'regex:/\Aprivate-lists\.[1-9][0-9]*\z/'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'socket_id.*' => __('validation.realtime_auth'),
            'channel_name.*' => __('validation.realtime_auth'),
        ];
    }

    /**
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [function (Validator $validator) {
            // C-03：定義していない項目は受け取らない
            foreach (array_diff(array_keys($this->getInputSource()->all()), ['socket_id', 'channel_name']) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }
        }];
    }
}
