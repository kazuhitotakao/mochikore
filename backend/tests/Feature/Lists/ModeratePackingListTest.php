<?php

namespace Tests\Feature\Lists;

use App\Models\PackingList;
use App\Models\PackingListItem;
use App\Models\User;

class ModeratePackingListTest extends ListApiTestCase
{
    public function test_管理コマンドで非公開にし本人による再公開を拒否し解除後は本人が公開できる(): void
    {
        $user = User::factory()->create();
        $list = PackingList::factory()->for($user)->create(['is_public' => true, 'grouping_revision' => 3]);
        PackingListItem::factory()->for($list)->create();

        $this->artisan('lists:moderate', ['list' => $list->id])->assertSuccessful();
        $this->assertFalse($list->fresh()->is_public);
        $this->assertNotNull($list->fresh()->moderated_at);
        $this->assertSame(3, $list->fresh()->grouping_revision);
        $this->actingAsUser($user)->patchJson("/api/lists/{$list->id}/visibility", ['is_public' => true])
            ->assertForbidden()->assertJsonPath('code', 'list_moderated');

        // D-48：運営非公開でも、本人の閲覧・編集は続けられる
        $this->getJson("/api/lists/{$list->id}")->assertOk();
        $this->patchJson("/api/lists/{$list->id}", ['title' => '修正したリスト'])->assertOk();

        $this->artisan('lists:moderate', ['list' => $list->id, '--release' => true])->assertSuccessful();
        $this->assertNull($list->fresh()->moderated_at);
        $this->assertFalse($list->fresh()->is_public);
        $this->patchJson("/api/lists/{$list->id}/visibility", ['is_public' => true])->assertOk();
        $this->assertTrue($list->fresh()->is_public);
    }

    public function test_運営非公開でも本人が削除できる(): void
    {
        $user = User::factory()->create();
        $list = PackingList::factory()->for($user)->create(['moderated_at' => now()]);
        $this->actingAsUser($user)->deleteJson("/api/lists/{$list->id}")->assertNoContent();
        $this->assertModelMissing($list);
    }

    public function test_存在しない_i_dと不正な_i_dでは失敗しほかのリストを変えない(): void
    {
        $list = PackingList::factory()->create(['is_public' => true]);
        $before = $list->fresh()->getAttributes();
        foreach (['999999', '0', $list->id.'abc'] as $id) {
            $this->artisan('lists:moderate', ['list' => $id])->assertFailed();
        }
        $this->assertSame($before, $list->fresh()->getAttributes());
    }
}
