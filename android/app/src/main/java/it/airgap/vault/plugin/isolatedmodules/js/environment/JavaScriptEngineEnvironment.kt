package it.airgap.vault.plugin.isolatedmodules.js.environment

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.AssetManager
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.javascriptengine.IsolateStartupParameters
import androidx.javascriptengine.JavaScriptIsolate
import androidx.javascriptengine.JavaScriptSandbox
import com.getcapacitor.JSObject
import it.airgap.vault.plugin.isolatedmodules.FileExplorer
import it.airgap.vault.plugin.isolatedmodules.js.*
import it.airgap.vault.util.JSException
import it.airgap.vault.util.readBytes
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.guava.asDeferred
import kotlinx.coroutines.withContext

@RequiresApi(Build.VERSION_CODES.O)
class JavaScriptEngineEnvironment(
    private val context: Context,
    private val fileExplorer: FileExplorer,
) : JSEnvironment {
    private val sandbox: Deferred<JavaScriptSandbox> = JavaScriptSandbox.createConnectedInstanceAsync(context).asDeferred()
    private val isolates: MutableMap<String, JavaScriptIsolate> = mutableMapOf()

    override suspend fun isSupported(): Boolean =
        JavaScriptSandbox.isSupported() && sandbox.await().let {
            it.isFeatureSupported(JavaScriptSandbox.JS_FEATURE_PROVIDE_CONSUME_ARRAY_BUFFER)
                    && it.isFeatureSupported(JavaScriptSandbox.JS_FEATURE_PROMISE_RETURN)
        }

    @Throws(JSException::class)
    override suspend fun run(module: JSModule, action: JSModuleAction): JSObject = withContext(Dispatchers.Default) {
        useIsolatedModule(module) { jsIsolate ->
            val namespace = module.namespace?.let { "global.$it" } ?: "global"

            val script = """
                new Promise((resolve, reject) => {
                    execute(
                        $namespace,
                        '${module.identifier}',
                        ${action.toJson()},
                        function (result) {
                            resolve(JSON.stringify(result));
                        },
                        function (error) {
                            reject(JSON.stringify({ error }));
                        }
                    );
                })
            """.trimIndent()

            val result = jsIsolate.evaluateJavaScriptAsync(script).asDeferred().await()
            val jsObject = JSObject(result)
            jsObject.getString("error")?.let { error -> throw JSException(error) }

            jsObject
        }
    }

    override suspend fun destroy() {
        isolates.values.forEach { it.close() }
        sandbox.await().close()
    }

    private suspend inline fun <R> useIsolatedModule(module: JSModule, block: (JavaScriptIsolate) -> R): R {
        val jsIsolate = isolates.getOrPut(module.identifier) {
            sandbox.await().createIsolate(IsolateStartupParameters()).also {
                listOf(
                    it.evaluateJavaScriptAsync(fileExplorer.readJavaScriptEngineUtils().decodeToString()).asDeferred(),
                    it.evaluateJavaScriptAsync(fileExplorer.readIsolatedModulesScript().decodeToString()).asDeferred(),
                ).awaitAll()
                it.loadModule(module)
            }
        }

        return block(jsIsolate)
    }

    @SuppressLint("RequiresFeature" /* checked in JavaScriptEngineEnvironment#isSupported */)
    private suspend fun JavaScriptIsolate.loadModule(module: JSModule) {
        val sources = fileExplorer.readModuleSources(module)
        sources.forEachIndexed { idx, source ->
            val scriptId = "${module.identifier}-$idx-script"
            provideNamedData(scriptId, source)
            evaluateJavaScriptAsync("""
                android.consumeNamedDataAsArrayBuffer('${scriptId}').then((value) => {
                    var string = utf8ArrayToString(new Uint8Array(value));
                    eval(string);
                });
            """.trimIndent()).asDeferred().await()
        }
    }
}