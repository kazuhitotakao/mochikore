<?php

namespace App\Http\Controllers;

use App\Http\Requests\ConfirmEmailChangeRequest;
use App\Http\Requests\SendEmailChangeRequest;
use App\Services\EmailChangeService;
use Illuminate\Http\Response;

class EmailChangeController extends Controller
{
    public function store(SendEmailChangeRequest $request, EmailChangeService $service): Response
    {
        $service->send($request->user(), $request->validated('pending_email'), $request->validated('password'));

        return response()->noContent();
    }

    public function confirm(ConfirmEmailChangeRequest $request, EmailChangeService $service): Response
    {
        $service->confirm($request->user(), $request->validated('id'), $request->validated('hash'));

        return response()->noContent();
    }
}
