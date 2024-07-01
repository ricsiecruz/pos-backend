to update, push in main
nned to push package also
<!--  -->
pg_dump -Fc -v -d <source_database_connection_string> -f <dump_file_name>a
postgresql://myuser:mypassword@localhost:5432/mydatabase

pg_dump -Fc -v -d postgresql://postgres:R1cs1e09@localhost:5432/pos -f pos.bak

pg_restore -v -d postgresql://pos_owner:b6glQcCGmah4@ep-gentle-haze-a1mmolgz.ap-southeast-1.aws.neon.tech/pos pos.bak
<!--  -->
psql -U your_username
psql -U postgres
<!--  -->
Export data with pg_dump

Export your data from the source database with pg_dump:

pg_dump -Fc -v -d <source_database_connection_string> -f <dump_file_name>

pg_dump -Fc -v -d postgresql://pos_owner:b6glQcCGmah4@ep-gentle-haze-a1mmolgz-pooler.ap-southeast-1.aws.neon.tech/pos?sslmode=require -f pos2.bak

pg_dump -Fc -v -d psql 'postgresql://pos_owner:b6glQcCGmah4@ep-gentle-haze-a1mmolgz-pooler.ap-southeast-1.aws.neon.tech/pos?sslmode=require' -f pos2.bak
<!--  -->
Restore data to Neon with pg_restore

Restore your data to the target database in Neon with pg_restore.

pg_restore -v -d postgres://postgres.qeghiadabyybhcmyrktc:RC.Password_0207@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres dump.sql

pg_restore -v -d postgresql://postgres:R1cs1e09@localhost:5432/pos pos2.bak
<!--  -->
export data from neon tech
pg_dump "postgresql://pos_owner:b6glQcCGmah4@ep-gentle-haze-a1mmolgz-pooler.ap-southeast-1.aws.neon.tech/pos?sslmode=require" -F c -b -v -f pos3.dump