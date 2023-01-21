import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as network from "@pulumi/azure-native/network";
import * as containerservice from "@pulumi/azure-native/containerservice";

// pegar valores da configuração stack do pulumi
const projectConfig = new pulumi.Config();
const numWorkerNodes = projectConfig.getNumber("numWorkerNodes") || 1;
const k8sVersion = projectConfig.get("kubernetesVersion") || "1.24.3";
const prefixForDns = projectConfig.get("prefixForDns") || "pulumi";
const nodeVmSize = projectConfig.get("nodeVmSize") || "Standard_B2ms";

// configuração necessária
// const mgmtGroupId = projectConfig.require("mgmtGroupId");
// const sshPubKey = projectConfig.require("sshPubKey");

// criando meu grupo de recursos
const resourceGroup = new resources.ResourceGroup("my_pulumi_resource", {});

// criando minha Azure Virtual Network
const virtualNetwork = new network.VirtualNetwork("virtualNetwork", {
    addressSpace: {
        addressPrefixes: ["10.0.0.0/16"],
    },
    location: "eastus",
    resourceGroupName: resourceGroup.name
});

// criando 3 subnets na minha rede virtual
const subnet1 = new network.Subnet("subnet1", {
    addressPrefix: "10.0.0.0/22",
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: virtualNetwork.name
});

// criando o cluster no kubernetes
const managedCluster = new containerservice.ManagedCluster("clusterGerenciado", {
    /* aadProfile: {
      enableAzureRBAC: true,
      managed: false,
      // adminGroupObjectIDs: [mgmtGroupId],
    }, */
    addonProfiles: {},
    // usando multiplos agentes/nodes pools para distribuir nodes para subnets
    agentPoolProfiles: [{
        availabilityZones: ["1", "2", "3"],
        count: numWorkerNodes,
        enableNodePublicIP: false,
        mode: "System",
        name: "systempool",
        osType: "Linux",
        osDiskSizeGB: 30,
        type: "VirtualMachineScaleSets",
        vmSize: nodeVmSize,
        // para adicionais node pools
        vnetSubnetID: subnet1.id,
    }],

    apiServerAccessProfile: {
        authorizedIPRanges: ["0.0.0.0/0"],
        enablePrivateCluster: false,
    },

    dnsPrefix: prefixForDns,
    enableRBAC: true,
    location: "eastus",
    identity: {
        type: "SystemAssigned",
    },
    kubernetesVersion: k8sVersion,
    /* linuxProfile: {
        adminUsername: "azureuser",
         ssh: {
            publicKeys: [{
                keyData: sshPubKey,
            }],
       },
    }, */
    networkProfile: {
        networkPlugin: "azure",
        networkPolicy: "azure",
        serviceCidr: "10.96.0.0/16",
        dnsServiceIP: "10.96.0.10",
    },
    resourceGroupName: resourceGroup.name,

});

// construindo a build config para acessar o cluster
const creds = containerservice.listManagedClusterUserCredentialsOutput({
    resourceGroupName: resourceGroup.name,
    resourceName: managedCluster.name,
});

const encoded = creds.kubeconfigs[0].value;
const decoded = encoded.apply(enc => Buffer.from(enc, "base64").toString());

export const rgName = resourceGroup.name;
export const networkName = virtualNetwork.name;
export const clusterName = managedCluster.name;
export const kubeconfig = decoded;