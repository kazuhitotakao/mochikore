<?php

namespace Tests\Feature\SavedGroups;

use App\Models\PackingList;
use App\Models\PackingListGroup;
use App\Models\SavedGroup;
use App\Models\User;
use Tests\Feature\Lists\ListApiTestCase;

/**
 * API-41 よく使うグループの削除（F-28、D-102）。
 */
class DestroySavedGroupTest extends ListApiTestCase
{
    public function test_完全に削除し、追加済みのグループは残す(): void
    {
        $user = User::factory()->create();
        $savedGroup = SavedGroup::factory()->for($user)->create(['name' => '冷蔵']);
        // D-102：候補から足したグループは名前を複製しているので、候補を消しても残る
        $group = PackingListGroup::factory()->for(PackingList::factory()->for($user))->create(['name' => '冷蔵']);

        $this->actingAsUser($user)->deleteJson("/api/saved-groups/{$savedGroup->id}")->assertNoContent();

        $this->assertModelMissing($savedGroup);
        $this->assertModelExists($group);
    }

    public function test_ほかの人の候補・存在しない候補は同じ404で、消さない(): void
    {
        $user = User::factory()->create();
        $othersGroup = SavedGroup::factory()->create();

        foreach ([$othersGroup->id, 999999] as $id) {
            $this->actingAsUser($user)
                ->deleteJson("/api/saved-groups/{$id}")
                ->assertNotFound()
                ->assertExactJson(['message' => 'ページが見つかりません。', 'code' => 'not_found']);
        }
        $this->assertModelExists($othersGroup);
    }

    public function test_メール未認証なら403、ログインしていなければ401で、消さない(): void
    {
        $unverified = User::factory()->unverified()->create();
        $savedGroup = SavedGroup::factory()->for($unverified)->create();

        $this->actingAsUser($unverified)->deleteJson("/api/saved-groups/{$savedGroup->id}")
            ->assertForbidden()
            ->assertJsonPath('code', 'email_not_verified');

        $this->app['auth']->forgetGuards();
        $this->withoutToken()->deleteJson("/api/saved-groups/{$savedGroup->id}")
            ->assertUnauthorized()
            ->assertJsonPath('code', 'unauthenticated');
        $this->assertModelExists($savedGroup);
    }
}
