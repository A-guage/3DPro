"""
Project Tools for Unreal MCP.

This module provides tools for managing project-wide settings and configuration.
"""

import logging
from typing import Dict, Any
from mcp.server.fastmcp import FastMCP, Context

# Get logger
logger = logging.getLogger("UnrealMCP")

def register_project_tools(mcp: FastMCP):
    """Register project tools with the MCP server."""
    
    @mcp.tool()
    def create_input_mapping(
        ctx: Context,
        action_name: str,
        key: str,
        input_type: str = "Action"
    ) -> Dict[str, Any]:
        """
        Create an input mapping for the project.
        
        Args:
            action_name: Name of the input action
            key: Key to bind (SpaceBar, LeftMouseButton, etc.)
            input_type: Type of input mapping (Action or Axis)
            
        Returns:
            Response indicating success or failure
        """
        from unreal_mcp_server import get_unreal_connection
        
        try:
            unreal = get_unreal_connection()
            if not unreal:
                logger.error("Failed to connect to Unreal Engine")
                return {"success": False, "message": "Failed to connect to Unreal Engine"}
            
            params = {
                "action_name": action_name,
                "key": key,
                "input_type": input_type
            }
            
            logger.info(f"Creating input mapping '{action_name}' with key '{key}'")
            response = unreal.send_command("create_input_mapping", params)
            
            if not response:
                logger.error("No response from Unreal Engine")
                return {"success": False, "message": "No response from Unreal Engine"}
            
            logger.info(f"Input mapping creation response: {response}")
            return response
            
        except Exception as e:
            error_msg = f"Error creating input mapping: {e}"
            logger.error(error_msg)
            return {"success": False, "message": error_msg}

    @mcp.tool()
    def import_model(
        ctx: Context,
        source_path: str,
        destination_path: str = "",
        asset_name: str = None
    ) -> Dict[str, Any]:
        """
        Import an external 3D model file into the Unreal project.

        Args:
            ctx: The MCP context
            source_path: Full path to the source model file (e.g. "D:/Models/mycharacter.fbx")
            destination_path: Destination path in Content (e.g. "/Game/Models/MyCharacter"). If empty, auto-creates /Game/Imports/{asset_name}
            asset_name: Optional custom name for the imported asset (defaults to filename)

        Returns:
            Dict containing the imported asset path and status
        """
        from unreal_mcp_server import get_unreal_connection

        try:
            unreal = get_unreal_connection()
            if not unreal:
                logger.error("Failed to connect to Unreal Engine")
                return {"success": False, "message": "Failed to connect to Unreal Engine"}

            params = {
                "source_path": source_path,
            }
            if destination_path:
                params["destination_path"] = destination_path
            if asset_name:
                params["asset_name"] = asset_name

            logger.info(f"Importing model from '{source_path}' to '{destination_path if destination_path else 'auto'}'")
            response = unreal.send_command("import_model", params)

            if not response:
                logger.error("No response from Unreal Engine")
                return {"success": False, "message": "No response from Unreal Engine"}

            logger.info(f"Import model response: {response}")
            return response

        except Exception as e:
            error_msg = f"Error importing model: {e}"
            logger.error(error_msg)
            return {"success": False, "message": error_msg}

    @mcp.tool()
    def download_and_import_model(
        ctx: Context,
        model_url: str,
        asset_name: str,
        destination_path: str = ""
    ) -> Dict[str, Any]:
        """
        Download a 3D model from URL and import it into Unreal Engine.

        This tool downloads the model file and imports it into UE using MCP.

        Args:
            ctx: The MCP context
            model_url: URL to download the model from
            asset_name: English name for the asset (no Chinese characters)
            destination_path: Destination path in Content. If empty, auto-creates /Game/Imports/{asset_name}

        Returns:
            Dict containing the imported asset path and status
        """
        import requests

        try:
            backend_url = "http://localhost:8000"

            body = {
                "model_url": model_url,
                "model_name": asset_name,
            }
            if destination_path:
                body["destination_path"] = destination_path

            logger.info(f"Calling backend to download model from '{model_url}'")
            response = requests.post(
                f"{backend_url}/api/asset-library/download-and-import",
                json=body,
                timeout=120
            )

            if response.status_code == 200:
                result = response.json()
                logger.info(f"Download result: {result}")

                if result.get("success"):
                    file_path = result.get("file_path")
                    if file_path:
                        logger.info(f"Calling import_model for '{file_path}'")
                        import_response = import_model(ctx, file_path, destination_path, asset_name)
                        logger.info(f"Import result: {import_response}")
                        return import_response
                    
                    return {
                        "success": True,
                        "message": result.get("message", "Model downloaded"),
                        "file_path": file_path,
                        "asset_name": asset_name,
                    }
                else:
                    return {
                        "success": False,
                        "message": result.get("message", "Download failed"),
                    }
            else:
                return {
                    "success": False,
                    "message": f"Backend API error: {response.status_code}",
                }

        except requests.exceptions.Timeout:
            return {
                "success": False,
                "message": "Download timeout. Please try again or use a smaller model.",
            }
        except Exception as e:
            error_msg = f"Error downloading/importing model: {e}"
            logger.error(error_msg)
            return {"success": False, "message": error_msg}

    logger.info("Project tools registered successfully") 