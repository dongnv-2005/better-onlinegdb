#include <stdio.h>
 
int Sum(int n){
    if(n == 0) // điều kiện dừng (phần cơ sở)
      return 0;
    return n + Sum(n-1);
}
 
int main(){
    int sum = Sum(5);
    printf("Sum = %d", sum);

    return 0;
}