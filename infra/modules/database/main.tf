# Aurora Serverless v2 for PostgreSQL (ADR 0015, ADR 0017), in the default VPC's public subnets.
# The Lambdas are not in a VPC, so Aurora is reachable from anywhere on 5432, over TLS only
# (`rds.force_ssl`). The master user owns the schema and runs migrations; the app connects as
# `ibbun_app` with IAM tokens. It pauses when idle, so an idle month costs storage and its IPv4 address.
terraform {
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.7" }
  }
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "database" {
  name        = "${var.name}-database"
  description = "Aurora over TLS from anywhere: the Lambdas are not in a VPC (ADR 0015)"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "postgres" {
  security_group_id = aws_security_group.database.id
  ip_protocol       = "tcp"
  from_port         = 5432
  to_port           = 5432
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_db_subnet_group" "database" {
  name       = "${var.name}-database"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_rds_cluster_parameter_group" "database" {
  name   = "${var.name}-database"
  family = "aurora-postgresql17"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
    # A static parameter: AWS records it as pending-reboot, and `immediate` would show as drift.
    apply_method = "pending-reboot"
  }
}

# Write-only: the password reaches AWS and SSM but never the state file. To rotate it, bump
# `password_version`.
ephemeral "random_password" "master" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "master_password" {
  name             = "/${var.name}/database/master-password"
  type             = "SecureString"
  value_wo         = ephemeral.random_password.master.result
  value_wo_version = var.password_version
}

resource "aws_rds_cluster" "database" {
  cluster_identifier                  = var.name
  engine                              = "aurora-postgresql"
  engine_version                      = var.engine_version
  database_name                       = var.database_name
  master_username                     = var.owner_role
  master_password_wo                  = ephemeral.random_password.master.result
  master_password_wo_version          = var.password_version
  iam_database_authentication_enabled = true
  storage_encrypted                   = true
  backup_retention_period             = 7
  db_subnet_group_name                = aws_db_subnet_group.database.name
  vpc_security_group_ids              = [aws_security_group.database.id]
  db_cluster_parameter_group_name     = aws_rds_cluster_parameter_group.database.name
  # A showcase holds guests and republished content only, so it goes without a final snapshot.
  skip_final_snapshot = true

  serverlessv2_scaling_configuration {
    min_capacity             = 0
    max_capacity             = var.max_acu
    seconds_until_auto_pause = 300
  }
}

resource "aws_rds_cluster_instance" "writer" {
  identifier          = "${var.name}-writer"
  cluster_identifier  = aws_rds_cluster.database.id
  instance_class      = "db.serverless"
  engine              = aws_rds_cluster.database.engine
  engine_version      = aws_rds_cluster.database.engine_version
  publicly_accessible = true
}
