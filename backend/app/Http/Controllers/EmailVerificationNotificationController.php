<?php

namespace App\Http\Controllers;

use App\Services\EmailVerification;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class EmailVerificationNotificationController extends Controller
{
    /**
     * API-24 確認メールを送り直す。メール未認証でも使える
     */
    public function __invoke(Request $request, EmailVerification $emailVerification): Response
    {
        $emailVerification->resend($request->user());

        return response()->noContent();
    }
}
