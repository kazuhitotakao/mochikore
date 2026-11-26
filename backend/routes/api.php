<?php

use App\Http\Controllers\BulkAddItemsController;
use App\Http\Controllers\BulkCheckItemsController;
use App\Http\Controllers\BulkDeleteItemsController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\CombinedViewController;
use App\Http\Controllers\CopyPublicPackingListController;
use App\Http\Controllers\CreateGroupFromItemController;
use App\Http\Controllers\DuplicatePackingListController;
use App\Http\Controllers\EmailChangeController;
use App\Http\Controllers\EmailVerificationNotificationController;
use App\Http\Controllers\ForgotPasswordController;
use App\Http\Controllers\ImportItemsController;
use App\Http\Controllers\InvitationController;
use App\Http\Controllers\InviteLinkController;
use App\Http\Controllers\ListMemberController;
use App\Http\Controllers\ListReportController;
use App\Http\Controllers\LoginController;
use App\Http\Controllers\LogoutController;
use App\Http\Controllers\PackingListController;
use App\Http\Controllers\PackingListGroupingController;
use App\Http\Controllers\PackingListItemController;
use App\Http\Controllers\PublicPackingListController;
use App\Http\Controllers\RealtimeAuthController;
use App\Http\Controllers\RegisterController;
use App\Http\Controllers\ReorderGroupsController;
use App\Http\Controllers\ReorderPackingListItemsController;
use App\Http\Controllers\ResetChecksController;
use App\Http\Controllers\ResetPasswordController;
use App\Http\Controllers\RestorePackingListItemController;
use App\Http\Controllers\SavedGroupController;
use App\Http\Controllers\SavedItemController;
use App\Http\Controllers\SharedPackingListController;
use App\Http\Controllers\ShareLinkController;
use App\Http\Controllers\TransferItemsController;
use App\Http\Controllers\UndoGroupFromItemController;
use App\Http\Controllers\UpdateEmptyGroupCheckController;
use App\Http\Controllers\UpdateGroupController;
use App\Http\Controllers\UpdateListVisibilityController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\VerifyEmailController;
use App\Http\Middleware\EnsureEmailIsVerified;
use App\Http\Middleware\EnsurePackingListIsPublic;
use App\Http\Middleware\NotifyListChange;
use App\Models\PackingList;
use Illuminate\Support\Facades\Route;

Route::post('/register', RegisterController::class)->middleware('throttle:register');
Route::post('/login', LoginController::class);
// D-41：入力不正も含め、同じIPアドレスからの要求を会員登録とは別に数える
Route::post('/forgot-password', ForgotPasswordController::class)->middleware('throttle:forgot-password');
Route::post('/reset-password', ResetPasswordController::class);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', LogoutController::class);
    Route::get('/me', [UserController::class, 'show']);
    // F-14：メール未認証でも、ログイン本人は退会できる
    Route::delete('/me', [UserController::class, 'destroy']);

    // D-72：Next.jsが別のホストで送るので、署名はホストを含めずに確かめる（signed:relative）
    Route::get('/email/verify/{id}/{hash}', VerifyEmailController::class)
        ->middleware('signed:relative')
        ->name('verification.verify');
    Route::post('/email/verification-notification', EmailVerificationNotificationController::class);

    // D-19：自分のリストは、メール認証が済んでから使える
    Route::middleware(EnsureEmailIsVerified::class)->group(function () {
        // API-63・D-119：共同編集のリストのチャンネルを聞くための認可。所有者・メンバーだけが通る。
        // F-35：下のルートのうち NotifyListChange を付けたものは、成功するとほかのメンバーへ「変わった」と配信する
        Route::post('/realtime/auth', RealtimeAuthController::class);
        // API-55・D-119：共同編集のメンバーに見せる表示名を変える
        Route::patch('/me', [UserController::class, 'update']);
        Route::post('/me/email-change', [EmailChangeController::class, 'store'])->middleware('throttle:email-change');
        // API-43・D-107：確認中の変更を取り消す。メールを送らないので、回数制限は付けない
        Route::delete('/me/email-change', [EmailChangeController::class, 'destroy']);
        Route::post('/me/email-change/confirm', [EmailChangeController::class, 'confirm'])
            ->middleware('signed:relative')->name('email-change.confirm');

        Route::post('/public/lists/{list}/copy', CopyPublicPackingListController::class)
            ->middleware(EnsurePackingListIsPublic::class);
        // API-49・D-114：限定公開のリンクのリストを自分用にコピーする（ログインとメール認証が必要）
        Route::post('/shared/lists/{token}/copy', [SharedPackingListController::class, 'copy'])
            ->where('token', '[A-Za-z0-9]{'.PackingList::SHARE_TOKEN_LENGTH.'}');
        // API-53・54・D-118：公開リスト・限定公開のリストから、選んだ持ち物を自分のリストへ取り込む
        Route::post('/public/lists/{list}/items/import', [ImportItemsController::class, 'fromPublic'])
            ->middleware([EnsurePackingListIsPublic::class, NotifyListChange::class]);
        Route::post('/shared/lists/{token}/items/import', [ImportItemsController::class, 'fromShared'])
            ->where('token', '[A-Za-z0-9]{'.PackingList::SHARE_TOKEN_LENGTH.'}')
            ->middleware(NotifyListChange::class);
        Route::get('/lists', [PackingListController::class, 'index']);
        Route::post('/lists', [PackingListController::class, 'store']);
        Route::get('/lists/{list}', [PackingListController::class, 'show']);
        Route::patch('/lists/{list}', [PackingListController::class, 'update'])->middleware(NotifyListChange::class);
        Route::delete('/lists/{list}', [PackingListController::class, 'destroy'])->middleware(NotifyListChange::class);
        Route::patch('/lists/{list}/visibility', UpdateListVisibilityController::class);
        // API-46・47・D-114：限定公開のリンクを作る・止める
        Route::post('/lists/{list}/share-link', [ShareLinkController::class, 'store']);
        Route::delete('/lists/{list}/share-link', [ShareLinkController::class, 'destroy']);
        // API-56・57・D-119：共同編集の招待リンクを作る・止める（所有者だけ）
        Route::post('/lists/{list}/invite-link', [InviteLinkController::class, 'store']);
        Route::delete('/lists/{list}/invite-link', [InviteLinkController::class, 'destroy']);
        // API-58〜60・D-119：メンバーの一覧、所有者がメンバーを外す、メンバーが自分で抜ける
        Route::get('/lists/{list}/members', [ListMemberController::class, 'index']);
        Route::delete('/lists/{list}/members/{member}', [ListMemberController::class, 'destroy'])->middleware(NotifyListChange::class);
        Route::delete('/lists/{list}/membership', [ListMemberController::class, 'leave'])->middleware(NotifyListChange::class);
        // API-61・62・D-119：招待リンクを開いた人が、内容を見て参加する。形の違うリンクは経路に合わず404
        Route::get('/invites/{token}', [InvitationController::class, 'show'])
            ->where('token', '[A-Za-z0-9]{'.PackingList::INVITE_TOKEN_LENGTH.'}');
        Route::post('/invites/{token}/join', [InvitationController::class, 'join'])
            ->where('token', '[A-Za-z0-9]{'.PackingList::INVITE_TOKEN_LENGTH.'}');
        // API-50・D-116：自分のリストを、入力した名前の新しいリストに複製する
        Route::post('/lists/{list}/duplicate', DuplicatePackingListController::class);

        Route::post('/lists/{list}/reset-checks', ResetChecksController::class)->middleware(NotifyListChange::class);
        Route::post('/lists/{list}/items', [PackingListItemController::class, 'store'])->middleware(NotifyListChange::class);
        Route::patch('/lists/{list}/items/order', ReorderPackingListItemsController::class)->middleware(NotifyListChange::class);
        Route::patch('/lists/{list}/items/checks', BulkCheckItemsController::class)->middleware(NotifyListChange::class);
        Route::post('/lists/{list}/items/bulk', BulkAddItemsController::class)->middleware(NotifyListChange::class);
        Route::post('/lists/{list}/items/bulk-delete', BulkDeleteItemsController::class)->middleware(NotifyListChange::class);
        // API-51・52・D-118：選んだ持ち物を自分の別のリストへコピー・移動する
        Route::post('/lists/{list}/items/copy', [TransferItemsController::class, 'copy'])->middleware(NotifyListChange::class);
        Route::post('/lists/{list}/items/move', [TransferItemsController::class, 'move'])->middleware(NotifyListChange::class);
        Route::get('/lists/{list}/grouping', [PackingListGroupingController::class, 'show']);
        Route::put('/lists/{list}/grouping', [PackingListGroupingController::class, 'update'])->middleware(NotifyListChange::class);
        Route::patch('/lists/{list}/groups/order', ReorderGroupsController::class)->middleware(NotifyListChange::class);
        Route::patch('/groups/{group}/check', UpdateEmptyGroupCheckController::class)->middleware(NotifyListChange::class);
        Route::patch('/groups/{group}', UpdateGroupController::class)->middleware(NotifyListChange::class);
        // 削除済み（SoftDeletes）の持ち物は見つからず、404 になる
        Route::patch('/items/{item}', [PackingListItemController::class, 'update'])->middleware(NotifyListChange::class);
        Route::delete('/items/{item}', [PackingListItemController::class, 'destroy'])->middleware(NotifyListChange::class);
        // 削除済みの持ち物を読み込めるよう withTrashed を付ける。完全に削除されたものは404
        Route::post('/items/{item}/restore', RestorePackingListItemController::class)->withTrashed()->middleware(NotifyListChange::class);
        // API-45・D-111：重ねられた持ち物（URL）をグループにし、重ねた持ち物を中へ移す
        Route::post('/items/{item}/group', CreateGroupFromItemController::class)->middleware(NotifyListChange::class);
        // API-64：URL の持ち物は見出しに変わって一時削除中なので、削除済みも読む（D-123）
        Route::delete('/items/{item}/group', UndoGroupFromItemController::class)->withTrashed()->middleware(NotifyListChange::class);

        // F-21・F-22：よく使う項目も、メール認証が済んでから使える
        Route::get('/saved-items', [SavedItemController::class, 'index']);
        Route::post('/saved-items', [SavedItemController::class, 'store']);
        Route::delete('/saved-items/{savedItem}', [SavedItemController::class, 'destroy']);

        // F-28：よく使うグループも、メール認証が済んでから使える
        Route::get('/saved-groups', [SavedGroupController::class, 'index']);
        Route::post('/saved-groups', [SavedGroupController::class, 'store']);
        Route::delete('/saved-groups/{savedGroup}', [SavedGroupController::class, 'destroy']);

        // API-65〜69・D-124：本人だけのまとめ表示。ほかのメンバーに知らせないので NotifyListChange は付けない。
        // 中身の表示・操作は今までのリストのAPI（API-07 など）で、リストごとの権限で行う
        Route::get('/combined-views', [CombinedViewController::class, 'index']);
        Route::post('/combined-views', [CombinedViewController::class, 'store']);
        Route::get('/combined-views/{combinedView}', [CombinedViewController::class, 'show']);
        Route::patch('/combined-views/{combinedView}', [CombinedViewController::class, 'update']);
        Route::delete('/combined-views/{combinedView}', [CombinedViewController::class, 'destroy']);
    });
});

Route::get('/categories', CategoryController::class);
// API-48・D-114：限定公開のリンクを知っている人は、ログインなしで見られる。形の違うリンクは経路に合わず404
Route::get('/shared/lists/{token}', [SharedPackingListController::class, 'show'])
    ->where('token', '[A-Za-z0-9]{'.PackingList::SHARE_TOKEN_LENGTH.'}');
// D-01：公開一覧はログイン・メール認証なしで利用できる
Route::get('/public/lists', [PublicPackingListController::class, 'index']);
Route::middleware(EnsurePackingListIsPublic::class)->group(function () {
    Route::get('/public/lists/{list}', [PublicPackingListController::class, 'show']);
    Route::post('/public/lists/{list}/reports', [ListReportController::class, 'store'])->middleware('throttle:list-reports');
});
