<?php

namespace App\Enums;

/**
 * 06_API一覧「エラーコード一覧」の16種類（D-54）。
 * 画面は message ではなく code で理由を見分けるので、値を変えない。
 */
enum ApiErrorCode: string
{
    case ValidationError = 'validation_error';
    case EmailAlreadyRegistered = 'email_already_registered';
    case InvalidCredentials = 'invalid_credentials';
    case InvalidPassword = 'invalid_password';
    case ListLimitReached = 'list_limit_reached';
    case ItemLimitReached = 'item_limit_reached';
    case SavedItemLimitReached = 'saved_item_limit_reached';
    case ListHasNoItems = 'list_has_no_items';
    case LinkInvalid = 'link_invalid';
    case Unauthenticated = 'unauthenticated';
    case EmailNotVerified = 'email_not_verified';
    case ListModerated = 'list_moderated';
    case NotFound = 'not_found';
    case TooManyRequests = 'too_many_requests';
    case ServerError = 'server_error';
    case GroupingConflict = 'grouping_conflict';

    public function status(): int
    {
        return match ($this) {
            self::ValidationError,
            self::EmailAlreadyRegistered,
            self::InvalidCredentials,
            self::InvalidPassword,
            self::ListLimitReached,
            self::ItemLimitReached,
            self::SavedItemLimitReached,
            self::ListHasNoItems,
            self::LinkInvalid => 422,
            self::Unauthenticated => 401,
            self::EmailNotVerified,
            self::ListModerated => 403,
            self::NotFound => 404,
            self::GroupingConflict => 409,
            self::TooManyRequests => 429,
            self::ServerError => 500,
        };
    }
}
