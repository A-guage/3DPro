"""End-to-end test: call plan_scene via MCP Python client and langchain adapter."""
import asyncio
import json
import sys
import os

sys.path.insert(0, r"D:\3DPro\deer-flow-main\backend\.venv\Lib\site-packages")
sys.path.insert(0, r"D:\3DPro\deer-flow-main\backend\packages\harness")

async def test_mcp_direct():
    """Test 1: Direct MCP client call to plan_scene."""
    print("=" * 60)
    print("TEST 1: Direct MCP Python client -> plan_scene")
    print("=" * 60)

    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    server_params = StdioServerParameters(
        command="node",
        args=[r"D:\3DPro\scene3d-mcp-server\dist\index.js"],
        env={
            **os.environ,
            "DEERFLOW_SCENE3D_CONFIG": r"D:\3DPro\scene3d-mcp-server\config.yaml",
        },
    )

    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            # List tools to find plan_scene
            tools_result = await session.list_tools()
            plan_scene_tool = None
            for t in tools_result.tools:
                if t.name == "plan_scene":
                    plan_scene_tool = t
                    break

            if plan_scene_tool is None:
                print("ERROR: plan_scene tool not found!")
                print("Available tools:", [t.name for t in tools_result.tools])
                return

            print(f"Found plan_scene tool: {plan_scene_tool.name}")
            print(f"  description: {plan_scene_tool.description}")
            print(f"  inputSchema: {json.dumps(plan_scene_tool.inputSchema, indent=2)}")
            print(f"  outputSchema: {getattr(plan_scene_tool, 'outputSchema', 'NOT SET')}")

            # Call plan_scene
            arguments = {
                "description": "A cozy living room with furniture",
                "objects": [
                    {
                        "label": "sofa",
                        "description": "A comfortable three-seater sofa",
                        "priority": 1,
                    },
                    {
                        "label": "coffee table",
                        "description": "A wooden coffee table",
                    },
                ],
            }

            print(f"\nCalling plan_scene with arguments: {json.dumps(arguments, indent=2)}")

            try:
                result = await session.call_tool("plan_scene", arguments)
                print(f"\nResult type: {type(result).__name__}")
                print(f"Result isError: {result.isError}")
                print(f"Result structuredContent: {result.structuredContent}")
                print(f"Result content ({len(result.content)} blocks):")
                for i, block in enumerate(result.content):
                    print(f"  Block {i}: type={type(block).__name__}")
                    if hasattr(block, "text"):
                        print(f"    text: {block.text[:200]}...")
                    elif hasattr(block, "data"):
                        print(f"    data: (binary, {len(block.data)} chars)")
                    else:
                        print(f"    raw: {block}")

                print("\nTEST 1 PASSED: plan_scene returned successfully via direct MCP client")

            except Exception as e:
                print(f"\nTEST 1 FAILED: plan_scene call raised exception: {e}")
                import traceback
                traceback.print_exc()


async def test_langchain_adapter():
    """Test 2: Call plan_scene via langchain-mcp-adapters."""
    print("\n" + "=" * 60)
    print("TEST 2: langchain-mcp-adapters -> plan_scene")
    print("=" * 60)

    from langchain_mcp_adapters.tools import convert_mcp_tool_to_langchain_tool
    from langchain_mcp_adapters.sessions import Connection
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    server_params = StdioServerParameters(
        command="node",
        args=[r"D:\3DPro\scene3d-mcp-server\dist\index.js"],
        env={
            **os.environ,
            "DEERFLOW_SCENE3D_CONFIG": r"D:\3DPro\scene3d-mcp-server\config.yaml",
        },
    )

    connection: Connection = {
        "transport": "stdio",
        "command": "node",
        "args": [r"D:\3DPro\scene3d-mcp-server\dist\index.js"],
        "env": {
            **os.environ,
            "DEERFLOW_SCENE3D_CONFIG": r"D:\3DPro\scene3d-mcp-server\config.yaml",
        },
    }

    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            tools_result = await session.list_tools()
            plan_scene_tool = None
            for t in tools_result.tools:
                if t.name == "plan_scene":
                    plan_scene_tool = t
                    break

            if plan_scene_tool is None:
                print("ERROR: plan_scene tool not found!")
                return

            lc_tool = convert_mcp_tool_to_langchain_tool(
                session=session,
                tool=plan_scene_tool,
            )

            print(f"LangChain tool: name={lc_tool.name}")
            print(f"  response_format: {lc_tool.response_format}")
            print(f"  has coroutine: {lc_tool.coroutine is not None}")
            print(f"  has func: {lc_tool.func is not None}")

            arguments = {
                "description": "A cozy living room with furniture",
                "objects": [
                    {
                        "label": "sofa",
                        "description": "A comfortable three-seater sofa",
                        "priority": 1,
                    },
                    {
                        "label": "coffee table",
                        "description": "A wooden coffee table",
                    },
                ],
            }

            print(f"\nCalling plan_scene via langchain adapter...")

            try:
                result = await lc_tool.coroutine(**arguments)
                print(f"\nResult type: {type(result).__name__}")
                if isinstance(result, tuple):
                    content, artifact = result
                    print(f"  Content type: {type(content).__name__}")
                    print(f"  Content length: {len(content) if isinstance(content, list) else 'N/A'}")
                    if isinstance(content, list):
                        for i, item in enumerate(content):
                            print(f"    Item {i}: type={type(item).__name__}")
                            if isinstance(item, dict):
                                print(f"      keys: {list(item.keys())}")
                                if "text" in item:
                                    print(f"      text: {item['text'][:200]}...")
                    elif isinstance(content, str):
                        print(f"    text: {content[:200]}...")
                    print(f"  Artifact: {artifact}")
                else:
                    print(f"  Result: {result}")

                print("\nTEST 2 PASSED: plan_scene returned successfully via langchain adapter")

            except Exception as e:
                print(f"\nTEST 2 FAILED: plan_scene call raised exception: {e}")
                import traceback
                traceback.print_exc()


async def test_langchain_tool_run():
    """Test 3: Call plan_scene via LangChain StructuredTool.run() (sync path)."""
    print("\n" + "=" * 60)
    print("TEST 3: LangChain StructuredTool.run() -> plan_scene (sync wrapper)")
    print("=" * 60)

    from langchain_mcp_adapters.tools import convert_mcp_tool_to_langchain_tool
    from langchain_mcp_adapters.sessions import Connection
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    server_params = StdioServerParameters(
        command="node",
        args=[r"D:\3DPro\scene3d-mcp-server\dist\index.js"],
        env={
            **os.environ,
            "DEERFLOW_SCENE3D_CONFIG": r"D:\3DPro\scene3d-mcp-server\config.yaml",
        },
    )

    connection: Connection = {
        "transport": "stdio",
        "command": "node",
        "args": [r"D:\3DPro\scene3d-mcp-server\dist\index.js"],
        "env": {
            **os.environ,
            "DEERFLOW_SCENE3D_CONFIG": r"D:\3DPro\scene3d-mcp-server\config.yaml",
        },
    }

    async with stdio_client(server_params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            tools_result = await session.list_tools()
            plan_scene_tool = None
            for t in tools_result.tools:
                if t.name == "plan_scene":
                    plan_scene_tool = t
                    break

            if plan_scene_tool is None:
                print("ERROR: plan_scene tool not found!")
                return

            lc_tool = convert_mcp_tool_to_langchain_tool(
                session=session,
                tool=plan_scene_tool,
            )

            # Simulate what DeerFlow does: patch with sync wrapper
            import time
            import concurrent.futures

            _SYNC_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=1, thread_name_prefix="mcp-sync-test")

            def _make_sync_wrapper(coro, tool_name):
                def sync_wrapper(*args, **kwargs):
                    task_coro = coro(*args, **kwargs)
                    loop = None
                    try:
                        loop = asyncio.get_running_loop()
                    except RuntimeError:
                        pass
                    if loop is not None and loop.is_running():
                        future = _SYNC_EXECUTOR.submit(asyncio.run, task_coro)
                        result = future.result(timeout=70)
                    else:
                        result = asyncio.run(task_coro)
                    return result
                return sync_wrapper

            lc_tool.func = _make_sync_wrapper(lc_tool.coroutine, lc_tool.name)

            arguments = {
                "description": "A cozy living room with furniture",
                "objects": [
                    {
                        "label": "sofa",
                        "description": "A comfortable three-seater sofa",
                        "priority": 1,
                    },
                ],
            }

            print(f"Calling plan_scene via sync wrapper (tool.run())...")

            try:
                result = lc_tool.run(
                    tool_input=arguments,
                    tool_call_id="test-call-123",
                )
                print(f"\nResult type: {type(result).__name__}")
                if hasattr(result, "content"):
                    print(f"  Content type: {type(result.content).__name__}")
                    if isinstance(result.content, list):
                        for i, item in enumerate(result.content):
                            print(f"    Item {i}: type={type(item).__name__}")
                            if isinstance(item, dict):
                                print(f"      keys: {list(item.keys())}")
                                if "text" in item:
                                    print(f"      text: {item['text'][:200]}...")
                    elif isinstance(result.content, str):
                        print(f"    text: {result.content[:200]}...")
                    print(f"  Artifact: {getattr(result, 'artifact', 'N/A')}")
                    print(f"  Tool call ID: {getattr(result, 'tool_call_id', 'N/A')}")
                    print(f"  Name: {getattr(result, 'name', 'N/A')}")
                    print(f"  Status: {getattr(result, 'status', 'N/A')}")
                else:
                    print(f"  Result: {result}")

                print("\nTEST 3 PASSED: plan_scene returned successfully via sync wrapper")

            except Exception as e:
                print(f"\nTEST 3 FAILED: plan_scene call raised exception: {e}")
                import traceback
                traceback.print_exc()


async def main():
    await test_mcp_direct()
    await test_langchain_adapter()
    await test_langchain_tool_run()


if __name__ == "__main__":
    asyncio.run(main())
