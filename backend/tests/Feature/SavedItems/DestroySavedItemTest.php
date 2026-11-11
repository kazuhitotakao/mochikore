<?php

namespace Tests\Feature\SavedItems;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\SavedItem;
use App\Models\User;
use Tests\Feature\Lists\ListApiTestCase;

/**
 * API-33 よく使う項目の削除（F-22、D-66・D-72）。
 */
class DestroySavedItemTest extends ListApiTestCase
{
    public function test_完全に削除し、追加済みの持ち物は残す(): void
    {
        $user = User::factory()->create();
        $savedItem = SavedItem::factory()->for($user)->create(['name' => '牛乳']);
        // D-66：候補から追加した持ち物は名前を複製しているので、候補を消しても残る
        $item = PackingListItem::factory()->for(PackingList::factory()->for($user))->create(['name' => '牛乳']);

        $this->actingAsUser($user)->deleteJson("/api/saved-items/{$savedItem->id}")->assertNoContent();

        $this->assertModelMissing($savedItem);
        $this->assertModelExists($item);
    }

    public function test_ほかの人の候補・存在しない候補は同じ404で、消さない(): void
    {
        $user = User::factory()->create();
        $othersItem = SavedItem::factory()->create();

        foreach ([$othersItem->id, 999999] as $id) {
            $this->actingAsUser($user)
                ->deleteJson("/api/saved-items/{$id}")
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
        $this->assertModelExists($othersItem);
    }

    public function test_メール未認証なら403、ログインしていなければ401で、消さない(): void
    {
        $unverified = User::factory()->unverified()->create();
        $savedItem = SavedItem::factory()->for($unverified)->create();

        $this->actingAsUser($unverified)->deleteJson("/api/saved-items/{$savedItem->id}")
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()->deleteJson("/api/saved-items/{$savedItem->id}")
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
        $this->assertModelExists($savedItem);
    }
}
