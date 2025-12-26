import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../services/api'
import type { LLMConfig, MCPServerRequest } from '../../../shared/types'

export function useConfig() {
  const queryClient = useQueryClient()

  const { data: config, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => apiClient.getConfig()
  })

  const updateLLMMutation = useMutation({
    mutationFn: (newConfig: LLMConfig) => apiClient.updateLLMConfig(newConfig),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
    }
  })

  const addMCPServerMutation = useMutation({
    mutationFn: (server: MCPServerRequest) => apiClient.addMCPServer(server),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
    }
  })

  const deleteMCPServerMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteMCPServer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
    }
  })

  const toggleMCPServerMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiClient.toggleMCPServer(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config'] })
    }
  })

  return {
    config,
    isLoading,
    updateLLM: updateLLMMutation.mutateAsync,
    addMCPServer: addMCPServerMutation.mutateAsync,
    deleteMCPServer: deleteMCPServerMutation.mutateAsync,
    toggleMCPServer: toggleMCPServerMutation.mutateAsync,
    isUpdating:
      updateLLMMutation.isPending ||
      addMCPServerMutation.isPending ||
      deleteMCPServerMutation.isPending ||
      toggleMCPServerMutation.isPending
  }
}

export function useHealthCheck() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.healthCheck(),
    refetchInterval: 30000 // Refetch every 30 seconds
  })
}
