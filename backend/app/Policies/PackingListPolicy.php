<?php

namespace App\Policies;

use App\Models\PackingList;
use App\Models\User;
use Illuminate\Auth\Access\Response;

class PackingListPolicy
{
    public function copy(User $user, PackingList $list): Response
    {
        // D-10・43・48：自分のリストでも、公開されているものだけをコピーできる
        return $list->is_public && $list->moderated_at === null
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    /**
     * リストの内容を見る（API-07・29・58）と、自分のリストとして複製する（API-50）。
     * D-119：所有者と共同編集のメンバーができる。
     */
    public function view(User $user, PackingList $list): Response
    {
        return $this->accessibleBy($user, $list);
    }

    /**
     * 中身（持ち物・グループ）の追加・変更・チェック・並べ替え・削除。
     * D-119：所有者と共同編集のメンバーができる。
     */
    public function editContents(User $user, PackingList $list): Response
    {
        return $this->accessibleBy($user, $list);
    }

    /**
     * リストそのものの編集（API-08）、公開・リンクで共有、招待リンク、メンバーを外す操作。
     * D-119：メンバーにはさせず、所有者だけができる。
     */
    public function update(User $user, PackingList $list): Response
    {
        return $this->ownedBy($user, $list);
    }

    /**
     * リストの削除（API-09）。D-119：所有者だけ。
     */
    public function delete(User $user, PackingList $list): Response
    {
        return $this->ownedBy($user, $list);
    }

    /**
     * D-43：他人のリストは、存在しないリストと同じ404にして、そのIDのリストがあることを知らせない。
     * D-119：メンバーが所有者だけの操作を呼んだときも、同じ404にする。
     */
    private function ownedBy(User $user, PackingList $list): Response
    {
        return $list->isOwnedBy($user)
            ? Response::allow()
            : Response::denyAsNotFound();
    }

    /**
     * D-43・D-119：所有者でもメンバーでもない人（外された・抜けた人も）には404。
     */
    private function accessibleBy(User $user, PackingList $list): Response
    {
        return $list->isAccessibleBy($user)
            ? Response::allow()
            : Response::denyAsNotFound();
    }
}
