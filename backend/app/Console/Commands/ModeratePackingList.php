<?php

namespace App\Console\Commands;

use App\Models\PackingList;
use App\Services\PackingListService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('lists:moderate {list : 対象のリストID} {--release : 運営による非公開を解除する}')]
#[Description('運営による非公開を設定・解除する（D-48）')]
class ModeratePackingList extends Command
{
    public function handle(PackingListService $service): int
    {
        $id = $this->argument('list');
        $list = preg_match('/^[1-9][0-9]*$/D', $id) ? PackingList::find($id) : null;

        if (! $list) {
            $this->error('リストが見つかりません。');

            return self::FAILURE;
        }

        $release = (bool) $this->option('release');
        $service->moderate($list, $release);
        $this->info($release ? '運営による非公開を解除しました。リストは非公開のままです。' : 'リストを運営により非公開にしました。');

        return self::SUCCESS;
    }
}
