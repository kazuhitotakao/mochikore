<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreListReportRequest;
use App\Models\PackingList;
use App\Services\ListReportService;
use Illuminate\Http\Response;

class ListReportController extends Controller
{
    public function store(StoreListReportRequest $request, PackingList $list, ListReportService $service): Response
    {
        $service->create($list, $request->validated('reason'));

        return response()->noContent();
    }
}
