<?php

use App\Http\Controllers\BulkAddItemsController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\EmailVerificationNotificationController;
use App\Http\Controllers\ForgotPasswordController;
use App\Http\Controllers\LoginController;
use App\Http\Controllers\LogoutController;
use App\Http\Controllers\PackingListController;
use App\Http\Controllers\PackingListGroupingController;
use App\Http\Controllers\PackingListItemController;
use App\Http\Controllers\RegisterController;
use App\Http\Controllers\ReorderPackingListItemsController;
use App\Http\Controllers\ResetChecksController;
use App\Http\Controllers\ResetPasswordController;
use App\Http\Controllers\RestorePackingListItemController;
use App\Http\Controllers\SavedItemController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\VerifyEmailController;
use App\Http\Middleware\EnsureEmailIsVerified;
use Illuminate\Support\Facades\Route;

Route::post('/register', RegisterController::class)->middleware('throttle:register');
Route::post('/login', LoginController::class);
// D-41：入力不正も含め、同じIPアドレスからの要求を会員登録とは別に数える
Route::post('/forgot-password', ForgotPasswordController::class)->middleware('throttle:forgot-password');
Route::post('/reset-password', ResetPasswordController::class);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', LogoutController::class);
    Route::get('/me', [UserController::class, 'show']);

    // D-72：Next.jsが別のホストで送るので、署名はホストを含めずに確かめる（signed:relative）
    Route::get('/email/verify/{id}/{hash}', VerifyEmailController::class)
        ->middleware('signed:relative')
        ->name('verification.verify');
    Route::post('/email/verification-notification', EmailVerificationNotificationController::class);

    // D-19：自分のリストは、メール認証が済んでから使える
    Route::middleware(EnsureEmailIsVerified::class)->group(function () {
        Route::get('/lists', [PackingListController::class, 'index']);
        Route::post('/lists', [PackingListController::class, 'store']);
        Route::get('/lists/{list}', [PackingListController::class, 'show']);
        Route::patch('/lists/{list}', [PackingListController::class, 'update']);
        Route::delete('/lists/{list}', [PackingListController::class, 'destroy']);

        Route::post('/lists/{list}/reset-checks', ResetChecksController::class);
        Route::post('/lists/{list}/items', [PackingListItemController::class, 'store']);
        Route::patch('/lists/{list}/items/order', ReorderPackingListItemsController::class);
        Route::post('/lists/{list}/items/bulk', BulkAddItemsController::class);
        Route::get('/lists/{list}/grouping', [PackingListGroupingController::class, 'show']);
        // 削除済み（SoftDeletes）の持ち物は見つからず、404 になる
        Route::patch('/items/{item}', [PackingListItemController::class, 'update']);
        Route::delete('/items/{item}', [PackingListItemController::class, 'destroy']);
        // 削除済みの持ち物を読み込めるよう withTrashed を付ける。完全に削除されたものは404
        Route::post('/items/{item}/restore', RestorePackingListItemController::class)->withTrashed();

        // F-21・F-22：よく使う項目も、メール認証が済んでから使える
        Route::get('/saved-items', [SavedItemController::class, 'index']);
        Route::post('/saved-items', [SavedItemController::class, 'store']);
        Route::delete('/saved-items/{savedItem}', [SavedItemController::class, 'destroy']);
    });
});

Route::get('/categories', CategoryController::class);
