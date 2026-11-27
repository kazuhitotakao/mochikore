<?php

namespace App\Http\Requests;

use App\Models\UserAvatar;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * API-71 写真を載せる・変える（F-38、SC-12、D-128）。
 * 画面が256px四方の JPEG に作り直し、data URL の文字にして送る（Next.js の窓口は文字の JSON だけを通すため）。
 */
class UpdateAvatarRequest extends FormRequest
{
    private const DATA_URL_PREFIX = 'data:image/jpeg;base64,';

    // 作り直した写真の中身。avatar() で読む
    private ?string $image = null;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // V-32：形の違いは中身を開く前に止め、大きすぎる文字を読み解かない
            'avatar' => ['bail', 'required', 'string', 'max:'.self::maxLength(), $this->checkImage(...)],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'avatar.required' => __('validation.avatar.required'),
            'avatar.*' => __('validation.avatar.invalid'),
        ];
    }

    /**
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [function (Validator $validator) {
            // C-03：写真のほかは受け取らない（ほかの人のIDなどの混入を断る）
            foreach (array_diff(array_keys($this->getInputSource()->all()), ['avatar']) as $field) {
                $validator->errors()->add((string) $field, __('validation.undefined_field'));
            }
        }];
    }

    /**
     * 確かめ終えた写真の中身（JPEG のバイト列）。
     */
    public function avatar(): string
    {
        return $this->image ?? '';
    }

    /**
     * V-32：JPEG の data URL で、中身が256px四方の JPEG、60KBまで。
     * 拡張子や送られた種類を信じず、中身の先頭と画像の大きさで確かめる。
     *
     * @param  Closure(string): void  $fail
     */
    private function checkImage(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! str_starts_with($value, self::DATA_URL_PREFIX)) {
            $fail(__('validation.avatar.invalid'));

            return;
        }

        $bytes = base64_decode(substr($value, strlen(self::DATA_URL_PREFIX)), true);
        if ($bytes === false || $bytes === '' || strlen($bytes) > UserAvatar::MAX_BYTES) {
            $fail(__('validation.avatar.invalid'));

            return;
        }

        if ((new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) !== 'image/jpeg') {
            $fail(__('validation.avatar.invalid'));

            return;
        }

        // 壊れた JPEG では警告が出るので抑え、読めなかったものとして断る
        $size = @getimagesizefromstring($bytes);
        if ($size === false || $size[2] !== IMAGETYPE_JPEG
            || $size[0] !== UserAvatar::SIZE || $size[1] !== UserAvatar::SIZE) {
            $fail(__('validation.avatar.invalid'));

            return;
        }

        $this->image = $bytes;
    }

    // 60KB を base64 にした長さと先頭の文字。これより長い文字は読み解く前に断る
    private static function maxLength(): int
    {
        return strlen(self::DATA_URL_PREFIX) + (int) ceil(UserAvatar::MAX_BYTES / 3) * 4;
    }
}
