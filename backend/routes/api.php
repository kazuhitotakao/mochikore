<?php

use App\Http\Controllers\EmailVerificationNotificationController;
use App\Http\Controllers\ForgotPasswordController;
use App\Http\Controllers\LoginController;
use App\Http\Controllers\LogoutController;
use App\Http\Controllers\RegisterController;
use App\Http\Controllers\ResetPasswordController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\VerifyEmailController;
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
});
