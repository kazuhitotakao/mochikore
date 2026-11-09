<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TestingDatabaseConnectionTest extends TestCase
{
    public function test_it_connects_to_the_mysql_test_database(): void
    {
        $this->assertSame('mysql', config('database.default'));
        $this->assertSame('mochikore_test', config('database.connections.mysql.database'));

        $row = DB::selectOne('SELECT DATABASE() AS database_name');

        $this->assertSame('mochikore_test', $row->database_name);
    }
}
