<?php

namespace App\Exceptions;

use App\Enums\ApiErrorCode;
use Illuminate\Http\JsonResponse;
use RuntimeException;

class ApiException extends RuntimeException
{
    public function __construct(
        public ApiErrorCode $errorCode,
        string $message,
        public ?int $retryAfter = null,
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        $body = [
            'message' => $this->getMessage(),
            'code' => $this->errorCode->value,
        ];
        $headers = [];

        // D-53：429では再試行できるまでの秒数を返し、画面の「あと○秒」に使う
        if ($this->retryAfter !== null) {
            $body['retry_after'] = $this->retryAfter;
            $headers['Retry-After'] = $this->retryAfter;
        }

        return response()->json($body, $this->errorCode->status(), $headers);
    }
}
