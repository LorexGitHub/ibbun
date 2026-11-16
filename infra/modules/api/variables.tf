variable "name" {
  description = "Prefixes every resource, e.g. `ibbun-showcase`."
  type        = string
}

variable "build_dir" {
  description = "The bundle from `pnpm stack:build:api`."
  type        = string
}

variable "ssm_path" {
  description = "The API reads every parameter directly under this path, e.g. `/ibbun-showcase/app`."
  type        = string
}

variable "database_url" {
  type = string
}

variable "database_connect_arn" {
  type = string
}

variable "auth_secret_version" {
  description = "Bump to generate a new AUTH_SECRET."
  type        = number
  default     = 1
}
