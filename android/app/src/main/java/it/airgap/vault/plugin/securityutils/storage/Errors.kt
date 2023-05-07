package it.airgap.vault.plugin.securityutils.storage

object Errors {
    const val ITEM_CORRUPTED = "Item corrupted"
    const val DIGEST_NOT_MATCHING = "Digest did not match, wrong secret"
    const val WRONG_PARANOIA = "Wrong paranoia password"
    const val CANNOT_DELETE_FILE = "Could not delete file"
    const val AUTHENTICATION_CANCELED = "Authentication canceled"
}