variable "name" {
  description = "Prefixes every resource, e.g. `ibbun-showcase`."
  type        = string
}

variable "engine_version" {
  type    = string
  default = "17.11"
}

variable "database_name" {
  type    = string
  default = "ibbun"
}

variable "owner_role" {
  description = "The master user, which owns the schema and runs migrations."
  type        = string
  default     = "ibbun"
}

variable "app_role" {
  description = "The role the app connects as, with IAM tokens."
  type        = string
  default     = "ibbun_app"
}

# Each ACU-hour costs $0.14. The cap keeps a runaway query from scaling up the bill.
variable "max_acu" {
  type    = number
  default = 2
}

variable "password_version" {
  description = "Bump to generate and set a new master password."
  type        = number
  default     = 1
}
