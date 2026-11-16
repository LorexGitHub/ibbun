output "endpoint" {
  value = aws_rds_cluster.database.endpoint
}

output "url" {
  description = "DATABASE_URL for the app. No password: it signs in with an IAM token."
  value       = "postgres://${var.app_role}@${aws_rds_cluster.database.endpoint}:5432/${var.database_name}"
}

output "connect_arn" {
  description = "The resource for the API's `rds-db:connect` permission."
  value       = "arn:aws:rds-db:${data.aws_vpc.default.region}:${split(":", aws_rds_cluster.database.arn)[4]}:dbuser:${aws_rds_cluster.database.cluster_resource_id}/${var.app_role}"
}

output "master_password_parameter" {
  value = aws_ssm_parameter.master_password.name
}
